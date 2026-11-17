from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy.signal import find_peaks

import tlc_backend
from tlc_shoulder import fit_shoulder_group


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


def test_rgb_window_changes_grayscale_and_rejects_out_of_range_width() -> None:
    red = np.zeros((4, 4, 3), dtype=np.uint8)
    red[:, :, 0] = 255
    source = image_data_url(red)
    assert np.all(tlc_backend.load_gray(source, target_wavelength=450, wavelength_bandwidth=0) == 0)
    assert np.array_equal(
        tlc_backend.load_gray(source, target_wavelength=450, wavelength_bandwidth=None),
        tlc_backend.load_gray(source, target_wavelength=450, wavelength_bandwidth=0),
    )
    assert np.array_equal(
        tlc_backend.load_gray(source, wavelength_bandwidth=50),
        tlc_backend.load_gray(source, wavelength_bandwidth=0),
    )
    wider = tlc_backend.load_gray(source, target_wavelength=450, wavelength_bandwidth=50)
    assert np.all(wider > 0)
    assert np.array_equal(
        tlc_backend.load_gray(source, target_wavelength=540.5, wavelength_bandwidth=2.5),
        tlc_backend.load_gray(source, target_wavelength=541, wavelength_bandwidth=3),
    )
    with pytest.raises(tlc_backend.ParameterValidationError):
        tlc_backend.load_gray(source, target_wavelength=540, wavelength_bandwidth=51)
    assert tlc_backend.generate_profiles(
        {"image": source, "lanes": [], "target_wavelength": 450, "wavelength_bandwidth": None}
    )["results"] == []


def test_rgb_window_changes_peak_detection_from_a_colour_band() -> None:
    image = np.zeros((120, 40, 3), dtype=np.uint8)
    image[50:59, 8:32, 0] = 255
    payload = {
        "image": image_data_url(image),
        "lanes": [{"id": "red-band", "cx": 20, "cy": 60, "w": 24, "h": 110, "angle": 0}],
        "peak_detection": True,
        "peak_prominence": 80,
        "peak_distance": 4,
        "peak_threshold": 50,
        "smooth_sigma": 1.0,
        "polarity_mode": "bright",
        "target_wavelength": 450,
    }
    target_only = tlc_backend.generate_profiles({**payload, "wavelength_bandwidth": 0})["results"][0]
    wider = tlc_backend.generate_profiles({**payload, "wavelength_bandwidth": 50})["results"][0]
    assert max(target_only["profile_analysis"]) == 0
    assert not target_only["peaks"]
    assert max(wider["profile_analysis"]) > 0
    assert wider["peaks"]


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
    assert (peak["area_lb"], peak["area_rb"]) == (peak["display_lb"], peak["display_rb"])
    assert peak["area"] == pytest.approx(
        tlc_backend.integrate_peak_area(analysis, peak["area_lb"], peak["area_rb"])
    )
    assert peak["manual"] is False
    assert peak["type"] == "N"


def test_width_threshold_is_the_authoritative_integration_interval() -> None:
    signal = np.asarray([0, 5, 25, 100, 25, 5, 0], dtype=float)
    wide = tlc_backend._display_bounds(signal, 3, 0, 6, 0.20)
    narrow = tlc_backend._display_bounds(signal, 3, 0, 6, 0.60)
    assert wide == (1, 5)
    assert narrow == (2, 4)
    assert tlc_backend.integrate_peak_area(signal, *narrow) < tlc_backend.integrate_peak_area(signal, *wide)


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


def shoulder_plate(secondary_height: float = 35) -> tuple[np.ndarray, dict]:
    x = np.arange(240, dtype=float)
    signal = 80 * np.exp(-0.5 * ((x - 100) / 12) ** 2)
    signal += secondary_height * np.exp(-0.5 * ((x - 132) / 12) ** 2)
    gray = np.clip(180 - signal[::-1], 0, 255).astype(np.uint8)
    image = np.repeat(np.repeat(gray[:, None, None], 24, axis=1), 3, axis=2)
    return signal, {
        "image": image_data_url(image),
        "lanes": [{"id": "lane-a", "cx": 12, "cy": 120, "w": 20, "h": 240, "angle": 0}],
        "peak_detection": True,
        "peak_prominence": 40,
        "peak_distance": 8,
        "peak_threshold": 50,
        "smooth_sigma": 1.5,
        "polarity_mode": "dark",
    }


def test_shoulder_split_conserves_measured_width_union_and_zero_is_legacy() -> None:
    _signal, payload = shoulder_plate()
    ordinary = tlc_backend.generate_profiles(payload)
    assert ordinary == tlc_backend.generate_profiles({**payload, "shoulder_sensitivity": 0})
    assert len(ordinary["results"][0]["peaks"]) == 1
    assert ordinary["results"][0]["fit_groups"] == []

    lane = tlc_backend.generate_profiles({**payload, "shoulder_sensitivity": 80})["results"][0]
    assert [peak["idx"] for peak in lane["peaks"]] == pytest.approx([100, 132], abs=3)
    group = lane["fit_groups"][0]
    assert (group["status"], group["decision"], group["active"]) == ("resolved", "split", True)
    assert group["area_basis"] == "component_threshold_union"
    assert group["split_peaks"] == lane["peaks"]
    assert group["id"] == "lane-a:100"
    assert len(group["integration_segments"]) == 2
    assert sum(peak["area"] for peak in lane["peaks"]) == pytest.approx(group["measured_cluster_area"], abs=1e-4)
    assert sum(segment["area"] for segment in group["integration_segments"]) == pytest.approx(group["measured_cluster_area"], abs=1e-4)
    for segment in group["integration_segments"]:
        assert segment["area"] == pytest.approx(tlc_backend.integrate_peak_area(
            lane["profile_analysis"], segment["lb"], segment["rb"],
        ), abs=1e-4)
    fit_length = group["bounds"]["rb"] - group["bounds"]["lb"] + 1
    assert all(len(curve) == fit_length for curve in (
        group["baseline_curve"], group["single_curve"], group["double_curve"],
        *(component["curve"] for component in group["components"]),
    ))

    high_width = tlc_backend.generate_profiles({**payload, "shoulder_sensitivity": 80, "peak_threshold": 95})["results"][0]
    high_group = high_width["fit_groups"][0]
    assert high_group["status"] == "resolved"
    assert len(high_group["integration_segments"]) == 2
    outer = high_group["integration_bounds"]
    assert high_group["measured_cluster_area"] < 0.2 * tlc_backend.integrate_peak_area(
        high_width["profile_analysis"], outer["lb"], outer["rb"],
    )


def test_shoulder_keep_override_retains_single_and_offers_local_split() -> None:
    _signal, payload = shoulder_plate()
    split = tlc_backend.generate_profiles({**payload, "shoulder_sensitivity": 80})["results"][0]
    group_id = split["fit_groups"][0]["id"]
    kept = tlc_backend.generate_profiles({
        **payload, "shoulder_sensitivity": 80, "fit_overrides": {group_id: "keep"},
    })["results"][0]
    group = kept["fit_groups"][0]
    assert group["decision"] == "keep" and group["active"] is False
    assert kept["peaks"] == [group["original_peak"]]
    assert group["split_peaks"] == split["peaks"]


def test_weak_shoulder_skewed_tail_and_blank_plate_do_not_split() -> None:
    x = np.arange(240, dtype=float)
    rng = np.random.default_rng(3)
    cases = [
        80 * np.exp(-0.5 * ((x - 100) / 12) ** 2)
        + 8 * np.exp(-0.5 * ((x - 132) / 12) ** 2),
        80 * np.exp(-0.5 * ((x - 100) / np.where(x < 100, 10, 22)) ** 2)
        + np.where(x > 100, 5 * np.exp(-(x - 100) / 35), 0)
        + rng.normal(0, 0.3, len(x)),
        np.minimum(80 * np.exp(-0.5 * ((x - 100) / 12) ** 2)
                   + 35 * np.exp(-0.5 * ((x - 132) / 12) ** 2), 64),
    ]
    for raw in cases:
        normalized = (raw - raw.min()) / (raw.max() - raw.min()) * 100
        indices, properties = find_peaks(normalized, prominence=41, distance=8)
        assert len(indices) == 1
        apex = int(indices[0])
        left_base = int(properties["left_bases"][0]); right_base = int(properties["right_bases"][0])
        left, right = tlc_backend._display_bounds(normalized, apex, left_base, right_base, 0.5)
        original = {"idx": apex, "rf": tlc_backend.calculate_rf(apex, len(raw)),
                    "height_display": float(raw[apex]), "area": tlc_backend.integrate_peak_area(normalized, left, right),
                    "area_lb": left, "area_rb": right}
        group, peaks = fit_shoulder_group(
            normalized, raw, tlc_backend.calculate_rf, tlc_backend.integrate_peak_area,
            apex, left_base, right_base, 0.5, 80, f"lane-a:{apex}", original, [], None,
        )
        assert peaks is None
        assert group is None or group["status"] == "unresolved"

    blank = np.clip(180 + rng.integers(-2, 3, size=(240, 24, 1)), 0, 255).astype(np.uint8)
    blank = np.repeat(blank, 3, axis=2)
    payload = shoulder_plate()[1]
    payload["image"] = image_data_url(blank)
    lane = tlc_backend.generate_profiles({**payload, "shoulder_sensitivity": 100})["results"][0]
    assert not lane["fit_groups"]


def test_shoulder_request_rejects_invalid_overrides() -> None:
    with pytest.raises(tlc_backend.ParameterValidationError):
        tlc_backend.generate_profiles({
            "image": plate_with_dark_band(), "lanes": [], "fit_overrides": {"lane-a:100": []},
        })
