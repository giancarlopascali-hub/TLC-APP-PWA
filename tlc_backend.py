"""Validated analytical backend for the AQ-TLC mobile Streamlit component.

Only the two operations used by the mobile application live here:

``crop_image``
    Rotate an uploaded plate image and return a JPEG crop.

``generate_profiles``
    Produce origin-to-front lane profiles and automatic peak measurements.

The module deliberately has no Streamlit or Flask dependency.  It accepts plain
JSON-shaped dictionaries and returns plain dictionaries, while predictable input
and processing failures are raised as :class:`TLCBackendError` subclasses.  The
Streamlit host converts those errors into the versioned component protocol.

Images are not logged.  Decoded arrays are retained only in a bounded, in-memory
LRU cache so a long-lived Streamlit worker cannot grow without limit.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import math
import re
import threading
import warnings
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Mapping

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from scipy.ndimage import gaussian_filter1d, median_filter
from scipy.signal import find_peaks


# ---------------------------------------------------------------------------
# Public limits
# ---------------------------------------------------------------------------
#
# The limits are intentionally conservative for a phone-oriented Community
# Cloud app.  The browser should downscale before requests reach this module.
# They are exported to make the UI and tests use the same documented policy.
MAX_IMAGE_DATA_URL_BYTES = 16 * 1024 * 1024
MAX_IMAGE_DECODED_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_IMAGE_DIMENSION = 6_000
MAX_CROP_PIXELS = 12_000_000
MAX_CROP_OUTPUT_BYTES = 16 * 1024 * 1024
MAX_LANES = 32
MAX_LANE_ID_LENGTH = 128
MAX_COORDINATE = 100_000.0
MAX_LANE_DIMENSION = 12_000.0
MAX_SMOOTH_SIGMA = 20.0
MAX_PEAK_DISTANCE = 2_000
MAX_CACHE_ITEMS = 16
MAX_CACHE_BYTES = 96 * 1024 * 1024

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Typed failures
# ---------------------------------------------------------------------------


class TLCBackendError(Exception):
    """A safe, user-displayable backend failure.

    ``code`` is deliberately stable because the component protocol exposes it
    to the frontend.  The message must never contain a data URL, filesystem
    path, or implementation traceback.
    """

    code = "PROCESSING_FAILED"
    retryable = False

    def __init__(self, message: str, *, retryable: bool | None = None) -> None:
        super().__init__(message)
        self.message = message
        if retryable is not None:
            self.retryable = retryable


class PayloadValidationError(TLCBackendError):
    code = "INVALID_PAYLOAD"


class ImageValidationError(TLCBackendError):
    code = "INVALID_IMAGE"


class ImageLimitError(TLCBackendError):
    code = "IMAGE_TOO_LARGE"


class GeometryValidationError(TLCBackendError):
    code = "INVALID_GEOMETRY"


class CropValidationError(TLCBackendError):
    code = "INVALID_CROP"


class ParameterValidationError(TLCBackendError):
    code = "INVALID_PARAMETER"


# ---------------------------------------------------------------------------
# Byte-bounded LRU cache
# ---------------------------------------------------------------------------


class ByteBoundedImageCache:
    """A tiny thread-safe LRU cache that accounts for ndarray bytes.

    Images larger than the entire budget are returned to the caller but are not
    retained.  This is preferable to evicting useful entries only to keep one
    oversized image alive indefinitely.
    """

    def __init__(self, *, max_items: int, max_bytes: int) -> None:
        if max_items < 1 or max_bytes < 1:
            raise ValueError("Cache limits must be positive")
        self.max_items = max_items
        self.max_bytes = max_bytes
        self._items: OrderedDict[str, np.ndarray] = OrderedDict()
        self._bytes = 0
        self._lock = threading.RLock()

    def get(self, key: str) -> np.ndarray | None:
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: str, value: np.ndarray) -> None:
        if not isinstance(value, np.ndarray):
            raise TypeError("Image cache accepts numpy arrays only")
        size = int(value.nbytes)
        with self._lock:
            previous = self._items.pop(key, None)
            if previous is not None:
                self._bytes -= int(previous.nbytes)

            if size > self.max_bytes:
                return

            self._items[key] = value
            self._bytes += size
            while self._items and (
                len(self._items) > self.max_items or self._bytes > self.max_bytes
            ):
                _, evicted = self._items.popitem(last=False)
                self._bytes -= int(evicted.nbytes)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()
            self._bytes = 0

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "items": len(self._items),
                "bytes": self._bytes,
                "max_items": self.max_items,
                "max_bytes": self.max_bytes,
            }


_image_cache = ByteBoundedImageCache(
    max_items=MAX_CACHE_ITEMS,
    max_bytes=MAX_CACHE_BYTES,
)


def clear_image_cache() -> None:
    """Clear cached decoded images (primarily useful in deterministic tests)."""

    _image_cache.clear()


def image_cache_stats() -> dict[str, int]:
    """Return cache occupancy without exposing image content."""

    return _image_cache.stats()


# ---------------------------------------------------------------------------
# Validation and image decoding
# ---------------------------------------------------------------------------


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PayloadValidationError("The request payload must be an object.")
    return value


def _finite_number(
    value: Any,
    field: str,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
    error_type: type[TLCBackendError] = ParameterValidationError,
) -> float:
    if isinstance(value, bool):
        raise error_type(f"{field} must be a finite number.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise error_type(f"{field} must be a finite number.") from None
    if not math.isfinite(number):
        raise error_type(f"{field} must be a finite number.")
    if minimum is not None and number < minimum:
        raise error_type(f"{field} is below the supported range.")
    if maximum is not None and number > maximum:
        raise error_type(f"{field} is above the supported range.")
    return number


def _decode_data_url(data_url: Any) -> tuple[str, bytes, str]:
    """Validate and decode an allowed image data URL.

    Returns ``(sha256_key, raw_bytes, mime_type)``.  The data URL must be
    canonical base64 rather than arbitrary text with a comma suffix: that keeps
    MIME handling explicit and avoids decoding an unbounded payload first.
    """

    if not isinstance(data_url, str) or not data_url:
        raise ImageValidationError("An image data URL is required.")
    try:
        encoded_length = len(data_url.encode("ascii"))
    except UnicodeEncodeError:
        raise ImageValidationError("The image data URL is not valid ASCII base64.") from None
    if encoded_length > MAX_IMAGE_DATA_URL_BYTES:
        raise ImageLimitError("The encoded image exceeds the supported size limit.")

    match = _DATA_URL_RE.fullmatch(data_url)
    if match is None:
        raise ImageValidationError(
            "Use a JPEG, PNG, or WebP image encoded as a base64 data URL."
        )
    mime_type = match.group(1).lower()
    encoded = match.group(2)
    # This estimate avoids allocating a huge decoded object before enforcing the
    # raw-byte policy.  Padding is accounted for by the final decode length too.
    estimated_raw_length = (len(encoded) * 3) // 4
    if estimated_raw_length > MAX_IMAGE_DECODED_BYTES + 2:
        raise ImageLimitError("The image exceeds the supported size limit.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ImageValidationError("The image base64 data is invalid.") from None
    if not raw:
        raise ImageValidationError("The image contains no data.")
    if len(raw) > MAX_IMAGE_DECODED_BYTES:
        raise ImageLimitError("The image exceeds the supported size limit.")
    key = hashlib.sha256(data_url.encode("ascii")).hexdigest()
    return key, raw, mime_type


def load_image(data_url: Any) -> np.ndarray:
    """Decode an allowed image data URL to a BGR uint8 array.

    The returned array belongs to the cache and must be treated as read-only by
    callers.  Callers that need to modify it must create a copy first.
    """

    key, raw, _mime_type = _decode_data_url(data_url)
    cache_key = f"{key}:color"
    cached = _image_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as pil_image:
                width, height = pil_image.size
                if (
                    width < 1
                    or height < 1
                    or width > MAX_IMAGE_DIMENSION
                    or height > MAX_IMAGE_DIMENSION
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise ImageLimitError("The image dimensions exceed the supported limit.")
                # Force decoding while the source buffer is still open.  This
                # catches truncated or malformed payloads before OpenCV sees it.
                pil_image.load()
                rgb = np.asarray(pil_image.convert("RGB"), dtype=np.uint8)
    except ImageLimitError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageLimitError("The image dimensions exceed the supported limit.") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise ImageValidationError("The selected image could not be decoded.") from None

    if rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ImageValidationError("The selected image could not be decoded.")
    color = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    _image_cache.put(cache_key, color)
    return color


def wavelength_to_rgb(wavelength: float) -> tuple[float, float, float]:
    """Map a visible wavelength in nm to approximate RGB weights."""

    if 380 <= wavelength < 440:
        red, green, blue = -(wavelength - 440) / 60, 0.0, 1.0
    elif 440 <= wavelength < 490:
        red, green, blue = 0.0, (wavelength - 440) / 50, 1.0
    elif 490 <= wavelength < 510:
        red, green, blue = 0.0, 1.0, -(wavelength - 510) / 20
    elif 510 <= wavelength < 580:
        red, green, blue = (wavelength - 510) / 70, 1.0, 0.0
    elif 580 <= wavelength < 645:
        red, green, blue = 1.0, -(wavelength - 645) / 65, 0.0
    elif 645 <= wavelength <= 750:
        red, green, blue = 1.0, 0.0, 0.0
    else:
        red = green = blue = 0.0

    if 380 <= wavelength < 420:
        factor = 0.3 + 0.7 * (wavelength - 380) / 40
    elif 420 <= wavelength <= 700:
        factor = 1.0
    elif 700 < wavelength <= 750:
        factor = 0.3 + 0.7 * (750 - wavelength) / 50
    else:
        factor = 0.0
    return red * factor, green * factor, blue * factor


def _normalise_wavelength(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip().lower() in {"", "full", "none", "null"}:
        return None
    return _finite_number(
        value,
        "target_wavelength",
        minimum=380.0,
        maximum=750.0,
    )


def load_gray(data_url: Any, *, target_wavelength: Any = None) -> np.ndarray:
    """Decode an image to grayscale, optionally using visible-spectrum weights."""

    wavelength = _normalise_wavelength(target_wavelength)
    key, _raw, _mime_type = _decode_data_url(data_url)
    suffix = "gray" if wavelength is None else f"gray-wl-{wavelength:.1f}"
    cache_key = f"{key}:{suffix}"
    cached = _image_cache.get(cache_key)
    if cached is not None:
        return cached

    color = load_image(data_url)
    if wavelength is None:
        gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    else:
        red, green, blue = wavelength_to_rgb(wavelength)
        total = red + green + blue
        if total > 0:
            red, green, blue = red / total, green / total, blue / total
        else:
            red, green, blue = 0.299, 0.587, 0.114
        # ``color`` is BGR, hence blue weight is applied to channel 0.
        gray_float = (
            color[:, :, 0].astype(np.float32) * blue
            + color[:, :, 1].astype(np.float32) * green
            + color[:, :, 2].astype(np.float32) * red
        )
        gray = np.clip(gray_float, 0, 255).astype(np.uint8)

    _image_cache.put(cache_key, gray)
    return gray


# ---------------------------------------------------------------------------
# Numerical helpers
# ---------------------------------------------------------------------------


def calculate_rf(index: int, profile_length: int) -> float:
    """Return the legacy lane-box Rf calculation without rounding.

    A lane box has five percent padding at each end.  Consequently an index at
    the box edge is outside the valid 0--1 solvent interval.  Automatic peak
    detection rejects those values; the frontend must use the same policy when
    users add or move manual peaks.
    """

    if profile_length < 2:
        raise ValueError("At least two profile samples are required for Rf.")
    origin = 1.05 / 1.10
    front = 0.05 / 1.10
    y_fraction = 1.0 - (float(index) / (profile_length - 1))
    return (origin - y_fraction) / (origin - front)


def integrate_peak_area(signal: Any, left: Any, right: Any) -> float:
    """Integrate a baseline-corrected signal between inclusive integer bounds.

    This is the authoritative AUC formula shared with the frontend contract:
    endpoint minimum is the baseline, negative residuals are clipped, and unit
    sample spacing is used.  Short profiles and non-increasing bounds return
    zero.  Non-finite profile data is rejected rather than silently producing a
    misleading area.
    """

    values = np.asarray(signal, dtype=np.float64)
    if values.ndim != 1 or values.size < 2:
        return 0.0
    if not np.isfinite(values).all():
        raise ParameterValidationError("The analysis profile contains non-finite values.")
    try:
        left_index = int(left)
        right_index = int(right)
    except (TypeError, ValueError, OverflowError):
        return 0.0
    left_index = max(0, min(left_index, values.size - 1))
    right_index = max(0, min(right_index, values.size - 1))
    if right_index <= left_index:
        return 0.0
    baseline = min(float(values[left_index]), float(values[right_index]))
    residual = np.maximum(values[left_index : right_index + 1] - baseline, 0.0)
    # Explicit trapezoids keep the formula stable across NumPy releases.
    return float(np.sum((residual[:-1] + residual[1:]) / 2.0))


def _normalise_analysis_signal(display_signal: np.ndarray) -> np.ndarray:
    if display_signal.size == 0:
        return np.array([], dtype=np.float64)
    minimum = float(np.min(display_signal))
    maximum = float(np.max(display_signal))
    signal_range = maximum - minimum
    if signal_range < 1e-6:
        return np.zeros_like(display_signal, dtype=np.float64)
    return (display_signal - minimum) / signal_range * 100.0


def _display_bounds(
    analysis_signal: np.ndarray,
    apex: int,
    area_left: int,
    area_right: int,
    threshold_fraction: float,
) -> tuple[int, int]:
    """Find a visual threshold band enclosed by the integration interval."""

    baseline = min(float(analysis_signal[area_left]), float(analysis_signal[area_right]))
    threshold = baseline + (
        float(analysis_signal[apex]) - baseline
    ) * threshold_fraction

    left = area_left
    for candidate in range(apex, area_left, -1):
        if analysis_signal[candidate] < threshold:
            left = candidate
            break

    right = area_right
    for candidate in range(apex, area_right):
        if analysis_signal[candidate] < threshold:
            right = candidate
            break

    # A one-sample band is hard to operate on touch devices.  Widen where the
    # integration interval permits it, while never making visual bounds
    # authoritative or extending them beyond the area bounds.
    if right - left < 2:
        left = max(area_left, apex - 2)
        right = min(area_right, apex + 2)
    return int(left), int(right)


@dataclass(frozen=True)
class _ProfileSettings:
    image: str
    lanes: list[dict[str, Any]]
    peak_detection: bool
    peak_prominence: float
    peak_distance: int
    smooth_sigma: float
    peak_threshold: float
    polarity_mode: str
    target_wavelength: float | None
    invert_colors: bool


def _validate_lanes(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise PayloadValidationError("lanes must be an array.")
    if len(value) > MAX_LANES:
        raise PayloadValidationError(f"No more than {MAX_LANES} lanes can be analysed at once.")

    lanes: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_lane in enumerate(value):
        if not isinstance(raw_lane, Mapping):
            raise GeometryValidationError(f"Lane {index + 1} must be an object.")
        raw_id = raw_lane.get("id")
        if isinstance(raw_id, bool) or raw_id is None:
            raise GeometryValidationError(f"Lane {index + 1} needs an identifier.")
        lane_id = str(raw_id)
        if not lane_id or len(lane_id) > MAX_LANE_ID_LENGTH:
            raise GeometryValidationError(f"Lane {index + 1} has an invalid identifier.")
        if lane_id in seen_ids:
            raise GeometryValidationError("Lane identifiers must be unique.")
        seen_ids.add(lane_id)

        cx = _finite_number(
            raw_lane.get("cx"),
            f"lanes[{index}].cx",
            minimum=-MAX_COORDINATE,
            maximum=MAX_COORDINATE,
            error_type=GeometryValidationError,
        )
        cy = _finite_number(
            raw_lane.get("cy"),
            f"lanes[{index}].cy",
            minimum=-MAX_COORDINATE,
            maximum=MAX_COORDINATE,
            error_type=GeometryValidationError,
        )
        width = _finite_number(
            raw_lane.get("w"),
            f"lanes[{index}].w",
            minimum=0.001,
            maximum=MAX_LANE_DIMENSION,
            error_type=GeometryValidationError,
        )
        height = _finite_number(
            raw_lane.get("h"),
            f"lanes[{index}].h",
            minimum=0.001,
            maximum=MAX_LANE_DIMENSION,
            error_type=GeometryValidationError,
        )
        angle = _finite_number(
            raw_lane.get("angle", 0),
            f"lanes[{index}].angle",
            minimum=-math.tau,
            maximum=math.tau,
            error_type=GeometryValidationError,
        )
        lanes.append(
            {
                "id": lane_id,
                "cx": cx,
                "cy": cy,
                "w": width,
                "h": height,
                "angle": angle,
            }
        )
    return lanes


def _validate_profile_settings(data: Any) -> _ProfileSettings:
    payload = _as_mapping(data)
    image = payload.get("image")
    if not isinstance(image, str):
        raise PayloadValidationError("image must be a base64 data URL.")
    lanes = _validate_lanes(payload.get("lanes", []))

    peak_detection = payload.get("peak_detection", False)
    if not isinstance(peak_detection, bool):
        raise ParameterValidationError("peak_detection must be true or false.")
    invert_colors = payload.get("invert_colors", False)
    if not isinstance(invert_colors, bool):
        raise ParameterValidationError("invert_colors must be true or false.")

    prominence_slider = _finite_number(
        payload.get("peak_prominence", 10),
        "peak_prominence",
        minimum=1.0,
        maximum=80.0,
    )
    peak_distance_value = _finite_number(
        payload.get("peak_distance", 5),
        "peak_distance",
        minimum=1.0,
        maximum=float(MAX_PEAK_DISTANCE),
    )
    peak_distance = int(peak_distance_value)
    smooth_sigma = _finite_number(
        payload.get("smooth_sigma", 1.5),
        "smooth_sigma",
        minimum=0.0,
        maximum=MAX_SMOOTH_SIGMA,
    )
    threshold_percent = _finite_number(
        payload.get("peak_threshold", 50),
        "peak_threshold",
        minimum=0.0,
        maximum=100.0,
    )
    polarity_mode = payload.get("polarity_mode", "default")
    if polarity_mode not in {"default", "dark", "bright"}:
        raise ParameterValidationError("polarity_mode must be default, dark, or bright.")

    return _ProfileSettings(
        image=image,
        lanes=lanes,
        peak_detection=peak_detection,
        # The established UI exposes sensitivity inversely to scipy prominence.
        peak_prominence=81.0 - prominence_slider,
        peak_distance=peak_distance,
        smooth_sigma=smooth_sigma,
        peak_threshold=threshold_percent / 100.0,
        polarity_mode=polarity_mode,
        target_wavelength=_normalise_wavelength(payload.get("target_wavelength")),
        invert_colors=invert_colors,
    )


def _lane_profile(
    image: np.ndarray,
    lane: Mapping[str, Any],
    settings: _ProfileSettings,
) -> tuple[np.ndarray, np.ndarray]:
    """Return origin-to-front display and analysis arrays for one lane."""

    center = (float(lane["cx"]), float(lane["cy"]))
    angle_degrees = math.degrees(-float(lane["angle"]))
    matrix = cv2.getRotationMatrix2D(center, angle_degrees, 1.0)
    straight = cv2.warpAffine(image, matrix, (image.shape[1], image.shape[0]))

    half_width = float(lane["w"]) / 2.0
    half_height = float(lane["h"]) / 2.0
    y1 = max(0, int(float(lane["cy"]) - half_height))
    y2 = min(straight.shape[0], int(float(lane["cy"]) + half_height))
    x1 = max(0, int(float(lane["cx"]) - half_width))
    x2 = min(straight.shape[1], int(float(lane["cx"]) + half_width))
    roi = straight[y1:y2, x1:x2]
    if roi.size == 0:
        empty = np.array([], dtype=np.float64)
        return empty, empty

    raw_signal = np.mean(roi, axis=1)
    if settings.polarity_mode == "dark":
        profile = 255.0 - raw_signal
    elif settings.polarity_mode == "bright":
        profile = raw_signal
    elif float(np.mean(roi)) < float(np.median(roi)):
        profile = 255.0 - raw_signal
    else:
        profile = raw_signal

    if profile.size >= 3:
        window = max(21, int(profile.size * 0.50))
        if window % 2 == 0:
            window += 1
        # Median filtering with a larger footprint than the signal is legal,
        # but clipping it avoids needlessly expensive edge padding on tiny lanes.
        max_odd = profile.size if profile.size % 2 else profile.size - 1
        window = min(window, max_odd)
        if window >= 3:
            background = median_filter(profile, size=window)
            profile = np.clip(profile - background, 0, None)
        else:
            profile = profile - np.min(profile)
    else:
        profile = profile - np.min(profile)

    profile = profile - np.min(profile)
    if settings.smooth_sigma > 0 and profile.size > 1:
        profile = gaussian_filter1d(profile, sigma=settings.smooth_sigma)

    display = profile[::-1].astype(np.float64, copy=False)
    analysis = _normalise_analysis_signal(display)
    return display, analysis


def _detect_lane_peaks(
    display: np.ndarray,
    analysis: np.ndarray,
    settings: _ProfileSettings,
) -> list[dict[str, Any]]:
    if not settings.peak_detection or analysis.size <= 4:
        return []
    if float(np.max(analysis) - np.min(analysis)) < 1e-6:
        return []

    peak_indices, properties = find_peaks(
        analysis,
        prominence=settings.peak_prominence,
        distance=max(1, settings.peak_distance),
    )
    peaks: list[dict[str, Any]] = []
    for position, apex in enumerate(peak_indices):
        rf = calculate_rf(int(apex), int(analysis.size))
        # The source-of-truth policy rejects peaks in the padded lane margins.
        if rf < 0.0 or rf > 1.0:
            continue
        area_left = int(properties["left_bases"][position])
        area_right = int(properties["right_bases"][position])
        if area_right <= area_left:
            continue
        display_left, display_right = _display_bounds(
            analysis,
            int(apex),
            area_left,
            area_right,
            settings.peak_threshold,
        )
        area = integrate_peak_area(analysis, area_left, area_right)
        peaks.append(
            {
                "idx": int(apex),
                "rf": float(rf),
                "height_display": float(display[apex]),
                "height_analysis": float(analysis[apex]),
                "area": float(area),
                "area_lb": area_left,
                "area_rb": area_right,
                "display_lb": display_left,
                "display_rb": display_right,
                "manual": False,
                "type": "N",
            }
        )
    return peaks


# ---------------------------------------------------------------------------
# Public operations
# ---------------------------------------------------------------------------


def crop_image(data: Any) -> dict[str, str]:
    """Rotate and crop a data-URL image using validated image coordinates."""

    payload = _as_mapping(data)
    image = payload.get("image")
    if not isinstance(image, str):
        raise PayloadValidationError("image must be a base64 data URL.")
    x = _finite_number(
        payload.get("x"),
        "x",
        minimum=-MAX_COORDINATE,
        maximum=MAX_COORDINATE,
        error_type=GeometryValidationError,
    )
    y = _finite_number(
        payload.get("y"),
        "y",
        minimum=-MAX_COORDINATE,
        maximum=MAX_COORDINATE,
        error_type=GeometryValidationError,
    )
    width = _finite_number(
        payload.get("w"),
        "w",
        minimum=-MAX_COORDINATE,
        maximum=MAX_COORDINATE,
        error_type=GeometryValidationError,
    )
    height = _finite_number(
        payload.get("h"),
        "h",
        minimum=-MAX_COORDINATE,
        maximum=MAX_COORDINATE,
        error_type=GeometryValidationError,
    )
    angle = _finite_number(
        payload.get("angle", 0),
        "angle",
        minimum=-math.tau,
        maximum=math.tau,
        error_type=GeometryValidationError,
    )
    if width == 0 or height == 0:
        raise CropValidationError("The crop must have a non-zero width and height.")

    color = load_image(image)
    if angle != 0:
        matrix = cv2.getRotationMatrix2D(
            (color.shape[1] / 2, color.shape[0] / 2), math.degrees(-angle), 1.0
        )
        color = cv2.warpAffine(color, matrix, (color.shape[1], color.shape[0]))

    x1, x2 = sorted((int(x), int(x + width)))
    y1, y2 = sorted((int(y), int(y + height)))
    x1, x2 = max(0, x1), min(color.shape[1], x2)
    y1, y2 = max(0, y1), min(color.shape[0], y2)
    if x2 <= x1 or y2 <= y1:
        raise CropValidationError("The selected crop does not overlap the image.")
    if (x2 - x1) * (y2 - y1) > MAX_CROP_PIXELS:
        raise CropValidationError("The selected crop exceeds the supported size limit.")

    crop = color[y1:y2, x1:x2]
    encoded_ok, encoded = cv2.imencode(
        ".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 90]
    )
    if not encoded_ok:
        raise TLCBackendError("The image crop could not be encoded.", retryable=True)
    encoded_bytes = encoded.tobytes()
    if len(encoded_bytes) > MAX_CROP_OUTPUT_BYTES:
        raise CropValidationError("The selected crop exceeds the supported output size limit.")
    return {
        "image": "data:image/jpeg;base64,"
        + base64.b64encode(encoded_bytes).decode("ascii")
    }


def generate_profiles(data: Any) -> dict[str, Any]:
    """Generate origin-to-front profiles and optional automatic peak results.

    ``profile_display`` is baseline-corrected/smoothed display intensity and
    ``profile_analysis`` is the same signal normalised to 0--100.  Every
    reported automatic AUC uses only ``profile_analysis`` and ``area_lb`` /
    ``area_rb`` inclusive integration bounds.
    """

    settings = _validate_profile_settings(data)
    image = load_gray(settings.image, target_wavelength=settings.target_wavelength)
    if settings.invert_colors:
        image = 255 - image

    results: list[dict[str, Any]] = []
    for lane in settings.lanes:
        display, analysis = _lane_profile(image, lane, settings)
        results.append(
            {
                "id": lane["id"],
                "profile_display": [float(value) for value in display],
                "profile_analysis": [float(value) for value in analysis],
                "peaks": _detect_lane_peaks(display, analysis, settings),
            }
        )
    return {"results": results, "_detectPeaks": settings.peak_detection}
