from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import tlc_backend


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "numerical_cases.json"


def image_data_url(rgb: np.ndarray, image_format: str = "PNG") -> str:
    buffer = io.BytesIO()
    Image.fromarray(rgb.astype(np.uint8), mode="RGB").save(buffer, format=image_format)
    mime = "jpeg" if image_format.upper() == "JPEG" else image_format.lower()
    return "data:image/{};base64,".format(mime) + base64.b64encode(buffer.getvalue()).decode("ascii")


def plate_with_dark_band() -> str:
    image = np.full((120, 40, 3), 255, dtype=np.uint8)
    # The bottom is the lane origin.  This band is physically above it, so the
    # new origin-to-front profile should locate it at an interior Rf.
    image[50:59, 8:32] = 0
    return image_data_url(image)


def test_shared_area_fixtures() -> None:
    cases = json.loads(FIXTURES.read_text(encoding="utf-8"))["area_cases"]
    for case in cases:
        assert tlc_backend.integrate_peak_area(
            case["signal"], case["left"], case["right"]
        ) == pytest.approx(case["expected"]), case["name"]


def test_shared_rf_fixtures() -> None:
    cases = json.loads(FIXTURES.read_text(encoding="utf-8"))["rf_cases"]
    for case in cases:
        assert tlc_backend.calculate_rf(case["index"], case["length"]) == pytest.approx(
            case["expected"]
        ), case["name"]


def test_non_finite_analysis_signal_is_rejected() -> None:
    with pytest.raises(tlc_backend.ParameterValidationError):
        tlc_backend.integrate_peak_area([0, float("nan"), 1], 0, 2)


def test_image_cache_is_bounded_by_bytes_and_lru_order() -> None:
    cache = tlc_backend.ByteBoundedImageCache(max_items=3, max_bytes=10)
    cache.put("a", np.zeros(6, dtype=np.uint8))
    cache.put("b", np.zeros(6, dtype=np.uint8))
    assert cache.get("a") is None
    assert cache.get("b") is not None
    assert cache.stats()["bytes"] == 6

    cache.put("too-large", np.zeros(11, dtype=np.uint8))
    assert cache.get("too-large") is None
    assert cache.stats()["bytes"] == 6


def test_image_payload_mime_and_size_are_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(tlc_backend.ImageValidationError):
        tlc_backend.load_image("data:text/plain;base64,SGVsbG8=")

    monkeypatch.setattr(tlc_backend, "MAX_IMAGE_DATA_URL_BYTES", 10)
    with pytest.raises(tlc_backend.ImageLimitError):
        tlc_backend.load_image(plate_with_dark_band())


def test_image_pixel_limit_is_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    tlc_backend.clear_image_cache()
    monkeypatch.setattr(tlc_backend, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(tlc_backend.ImageLimitError):
        tlc_backend.load_image(plate_with_dark_band())


def test_crop_returns_a_jpeg_and_honours_normalised_negative_dimensions() -> None:
    source = np.zeros((30, 40, 3), dtype=np.uint8)
    source[:15, :, 0] = 255
    payload = {
        "image": image_data_url(source),
        "x": 30,
        "y": 20,
        "w": -20,
        "h": -10,
        "angle": 0,
    }
    response = tlc_backend.crop_image(payload)
    assert response["image"].startswith("data:image/jpeg;base64,")
    cropped = tlc_backend.load_image(response["image"])
    assert cropped.shape[:2] == (10, 20)


def test_crop_rejects_empty_or_nonfinite_geometry() -> None:
    payload = {"image": plate_with_dark_band(), "x": 1000, "y": 1000, "w": 2, "h": 2}
    with pytest.raises(tlc_backend.CropValidationError):
        tlc_backend.crop_image(payload)

    payload["x"] = float("nan")
    with pytest.raises(tlc_backend.GeometryValidationError):
        tlc_backend.crop_image(payload)


def test_profiles_expose_explicit_origin_to_front_signals_and_peak_schema() -> None:
    response = tlc_backend.generate_profiles(
        {
            "image": plate_with_dark_band(),
            "lanes": [{"id": "lane-1", "cx": 20, "cy": 60, "w": 24, "h": 110, "angle": 0}],
            "peak_detection": True,
            "peak_prominence": 80,
            "peak_distance": 4,
            "peak_threshold": 50,
            "smooth_sigma": 1.0,
            "polarity_mode": "dark",
        }
    )
    lane = response["results"][0]
    display = lane["profile_display"]
    analysis = lane["profile_analysis"]
    assert len(display) == len(analysis) == 110
    assert min(analysis) == pytest.approx(0)
    assert max(analysis) == pytest.approx(100)
    assert np.argmax(analysis) < len(analysis) - 10  # not the solvent-front edge
    assert response["_detectPeaks"] is True
    assert lane["peaks"], "The representative band should produce an automatic peak."

    peak = lane["peaks"][0]
    assert {
        "idx",
        "rf",
        "height_display",
        "height_analysis",
        "area",
        "area_lb",
        "area_rb",
        "display_lb",
        "display_rb",
        "manual",
        "type",
    } <= peak.keys()
    assert 0 <= peak["area_lb"] < peak["area_rb"] < len(analysis)
    assert peak["area_lb"] <= peak["display_lb"] <= peak["display_rb"] <= peak["area_rb"]
    assert peak["area"] == pytest.approx(
        tlc_backend.integrate_peak_area(analysis, peak["area_lb"], peak["area_rb"])
    )
    assert peak["manual"] is False
    assert peak["type"] == "N"


def test_empty_clipped_lane_returns_empty_profiles() -> None:
    response = tlc_backend.generate_profiles(
        {
            "image": plate_with_dark_band(),
            "lanes": [{"id": "outside", "cx": -500, "cy": -500, "w": 5, "h": 5}],
        }
    )
    lane = response["results"][0]
    assert lane["profile_display"] == []
    assert lane["profile_analysis"] == []
    assert lane["peaks"] == []


def test_invalid_lane_geometry_and_count_are_rejected() -> None:
    with pytest.raises(tlc_backend.GeometryValidationError):
        tlc_backend.generate_profiles(
            {
                "image": plate_with_dark_band(),
                "lanes": [{"id": "bad", "cx": 1, "cy": 1, "w": 0, "h": 5}],
            }
        )

    lanes = [
        {"id": str(index), "cx": 10, "cy": 10, "w": 5, "h": 5}
        for index in range(tlc_backend.MAX_LANES + 1)
    ]
    with pytest.raises(tlc_backend.PayloadValidationError):
        tlc_backend.generate_profiles({"image": plate_with_dark_band(), "lanes": lanes})


def test_profile_cache_never_exceeds_configured_budget() -> None:
    tlc_backend.clear_image_cache()
    tlc_backend.generate_profiles({"image": plate_with_dark_band(), "lanes": []})
    stats = tlc_backend.image_cache_stats()
    assert stats["items"] >= 1
    assert stats["bytes"] <= stats["max_bytes"]
