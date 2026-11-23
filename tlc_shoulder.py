"""Conservative shoulder detection and two-component fitting for mobile TLC profiles.

All curves use the measured, origin-to-front normalized analysis signal. The
caller provides the app's established Rf and trapezoidal-area functions so
quantitation stays identical to the rest of the mobile backend.
"""

from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np


def _asymmetric_gaussian(x: np.ndarray, amplitude: float, centre: float, left_width: float, right_width: float) -> np.ndarray:
    """A continuous, nonnegative peak with independently fitted left/right tails."""
    width = np.where(x < centre, left_width, right_width)
    return amplitude * np.exp(-0.5 * np.square((x - centre) / width))


def _shoulder_model(x: np.ndarray, parameters: np.ndarray, count: int) -> tuple[np.ndarray, np.ndarray, list[np.ndarray]]:
    """Return baseline, total fit, and baseline-free components on a local index grid."""
    scaled_x = (x - (len(x) - 1) / 2) / max(1, len(x))
    baseline = parameters[0] + parameters[1] * scaled_x + parameters[2] * np.square(scaled_x)
    components = [
        _asymmetric_gaussian(x, *parameters[3 + 4 * index : 7 + 4 * index])
        for index in range(count)
    ]
    return baseline, baseline + sum(components), components


def _shoulder_noise(signal: np.ndarray) -> float:
    """Robust high-frequency noise estimate in normalized analysis units."""
    from scipy.ndimage import gaussian_filter1d

    high_frequency = signal - gaussian_filter1d(signal, sigma=1.0)
    middle = float(np.median(high_frequency))
    return max(0.1, 1.4826 * float(np.median(np.abs(high_frequency - middle))))


def _shoulder_candidates(signal: np.ndarray, single_curve: np.ndarray, apex: int, sensitivity: float, noise: float) -> list[int]:
    """Find secondary curvature lobes, including lobes revealed by the one-peak residual."""
    from scipy.ndimage import gaussian_filter1d
    from scipy.signal import find_peaks

    peak_height = float(signal.max() - min(signal[0], signal[-1]))
    curvature = -gaussian_filter1d(signal, sigma=2.0, order=2)
    residual = gaussian_filter1d(signal - single_curve, sigma=1.5)
    residual_curvature = -gaussian_filter1d(residual, sigma=1.5, order=2)
    curvature_floor = max(0.025, float(curvature.max()) * (0.14 - 0.001 * sensitivity))
    residual_floor = max(0.025, noise * 0.12)
    raw_indices, raw_properties = find_peaks(curvature, prominence=curvature_floor, distance=3)
    residual_indices, residual_properties = find_peaks(residual_curvature, prominence=residual_floor, distance=3)
    candidates: dict[int, float] = {}
    for index, prominence in zip(raw_indices, raw_properties["prominences"]):
        if curvature[index] > curvature_floor and signal[index] > min(signal[0], signal[-1]) + peak_height * 0.12:
            candidates[int(index)] = float(prominence)
    for index, prominence in zip(residual_indices, residual_properties["prominences"]):
        if residual[index] > max(noise * (3.5 - 0.015 * sensitivity), peak_height * (0.055 - 0.0003 * sensitivity)):
            candidates[int(index)] = max(candidates.get(int(index), 0.0), float(prominence))
    minimum_separation = max(4, round(len(signal) * 0.045))
    return [
        index for index, _ in sorted(candidates.items(), key=lambda pair: pair[1], reverse=True)
        if abs(index - apex) >= minimum_separation and 2 <= index <= len(signal) - 3
    ][:3]


def _fit_shoulder_group_original(
    signal: np.ndarray,
    display_signal: np.ndarray,
    rf_fn: Callable[[float, int], float],
    area_fn: Callable[[Any, int, int], float],
    apex: int,
    base_lb: int,
    base_rb: int,
    threshold: float,
    sensitivity: float,
    group_id: str,
    original_peak: dict[str, Any],
    neighbor_intervals: list[tuple[int, int]],
    override: str | None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]] | None]:
    """Compare one versus two asymmetric peaks around a detected apex.

    Only a curvature-supported, statistically and materially better two-peak
    fit is allowed to replace the measured single peak. Candidate fits with
    insufficient support are exposed as unresolved, never silently accepted.
    """
    from scipy.optimize import least_squares

    if sensitivity <= 0 or base_rb - base_lb < 16:
        return None, None
    # Per-lane 0..100 normalization can amplify a nearly blank image into a
    # full-scale-looking trace. Require meaningful contrast in the measured
    # (pre-normalization) display profile before considering a split.
    raw_contrast = float(display_signal.max() - display_signal.min())

    # Fit through the low-signal shoulders, but keep the resulting measured
    # integration envelope separate from any neighbouring peak interval.
    baseline_level = min(float(signal[base_lb]), float(signal[base_rb]))
    cutoff = baseline_level + 0.025 * max(0.0, float(signal[apex]) - baseline_level)
    lb, rb = apex, apex
    while lb > base_lb and signal[lb] > cutoff:
        lb -= 1
    while rb < base_rb and signal[rb] > cutoff:
        rb += 1
    lb = max(base_lb, lb - 2)
    rb = min(base_rb, rb + 2)
    if rb - lb < 18 or rb - lb > 512 or any(lb <= right and left <= rb for left, right in neighbor_intervals):
        return None, None
    local_raw_contrast = float(np.ptp(display_signal[lb : rb + 1]))
    if local_raw_contrast < 8.0:
        return None, None

    y = np.asarray(signal[lb : rb + 1], dtype=float)
    x = np.arange(len(y), dtype=float)
    local_apex = apex - lb
    if not np.all(np.isfinite(y)) or y.max() - y.min() < 8:
        return None, None
    flat_run = np.flatnonzero(y >= y.max() * 0.985)
    if len(flat_run) >= max(7, round(len(y) * 0.08)):
        return None, None

    noise = _shoulder_noise(y)
    half_level = min(y[0], y[-1]) + 0.5 * (y[local_apex] - min(y[0], y[-1]))
    left_half = local_apex
    right_half = local_apex
    while left_half > 0 and y[left_half] >= half_level:
        left_half -= 1
    while right_half < len(y) - 1 and y[right_half] >= half_level:
        right_half += 1
    left_width = max(2.0, (local_apex - left_half) / 1.18)
    right_width = max(2.0, (right_half - local_apex) / 1.18)
    base_guess = max(0.0, min(float(y[0]), float(y[-1])))
    initial_single = np.array([base_guess, float(y[-1] - y[0]), 0.0,
                               max(1.0, float(y[local_apex] - base_guess)),
                               float(local_apex), left_width, right_width])
    single_lower = [0, -150, -150, 0, 1, 1.5, 1.5]
    single_upper = [120, 150, 150, 150, len(y) - 2, len(y), len(y)]
    def residuals(parameters: np.ndarray, count: int) -> np.ndarray:
        fitted_baseline, fitted_total, _ = _shoulder_model(x, parameters, count)
        return np.concatenate((
            fitted_total - y,
            3.0 * np.minimum(fitted_baseline, 0),
            3.0 * np.maximum(fitted_baseline - 100.0, 0),
        ))
    try:
        single_fit = least_squares(
            lambda params: residuals(params, 1),
            initial_single, bounds=(single_lower, single_upper), max_nfev=400,
        )
    except (ValueError, FloatingPointError):
        return None, None
    if not single_fit.success:
        return None, None
    _, single_curve, _ = _shoulder_model(x, single_fit.x, 1)
    candidates = _shoulder_candidates(y, single_curve, local_apex, sensitivity, noise)
    if not candidates:
        return None, None

    single_sse = float(np.sum(np.square(y - single_curve)))
    best: dict[str, Any] | None = None
    for candidate in candidates:
        # The two centres are constrained to opposite sides of the space
        # between the observed apex and the curvature shoulder candidate.
        if candidate > local_apex:
            main_min, main_max = max(1, local_apex - 8), min(len(y) - 3, candidate - 3)
            second_min, second_max = max(3, local_apex + 3), min(len(y) - 2, candidate + 8)
        else:
            main_min, main_max = max(3, candidate + 3), min(len(y) - 2, local_apex + 8)
            second_min, second_max = max(1, candidate - 8), min(len(y) - 3, local_apex - 3)
        if main_min >= main_max or second_min >= second_max:
            continue
        main_start = float(np.clip(single_fit.x[4], main_min + 0.01, main_max - 0.01))
        second_start = float(np.clip(candidate, second_min + 0.01, second_max - 0.01))
        initial_double = np.array([
            *single_fit.x[:3],
            max(1.0, single_fit.x[3] * 0.8), main_start,
            max(2.0, single_fit.x[5] * 0.9), max(2.0, single_fit.x[6] * 0.9),
            max(1.0, float(y[candidate] - single_curve[candidate]) * 2.0,
                single_fit.x[3] * 0.2),
            second_start, max(2.0, min(single_fit.x[5], len(y) / 5)),
            max(2.0, min(single_fit.x[6], len(y) / 5)),
        ])
        double_lower = [0, -150, -150, 0, main_min, 1.5, 1.5, 0, second_min, 1.5, 1.5]
        double_upper = [120, 150, 150, 150, main_max, len(y), len(y),
                        150, second_max, len(y), len(y)]
        try:
            double_fit = least_squares(
                lambda params: residuals(params, 2),
                initial_double, bounds=(double_lower, double_upper), max_nfev=700,
            )
        except (ValueError, FloatingPointError):
            continue
        if not double_fit.success:
            continue
        fitted_baseline, double_curve, component_curves = _shoulder_model(x, double_fit.x, 2)
        double_sse = float(np.sum(np.square(y - double_curve)))
        if best is None or double_sse < best["sse"]:
            best = {
                "parameters": double_fit.x,
                "baseline": fitted_baseline,
                "curve": double_curve,
                "components": component_curves,
                "sse": double_sse,
                "candidate": candidate,
            }
    if best is None:
        return None, None

    params = best["parameters"]
    fitted_baseline = best["baseline"]
    double_curve = best["curve"]
    component_curves = best["components"]
    ordered = sorted(range(2), key=lambda index: params[4 + 4 * index])
    centres = [float(params[4 + 4 * index] + lb) for index in ordered]
    widths = [(float(params[5 + 4 * index]), float(params[6 + 4 * index])) for index in ordered]
    amplitudes = [float(params[3 + 4 * index]) for index in ordered]
    # The fit uses a wide support, but reported area follows the existing
    # Width % setting. Integrate the union of the two component intervals:
    # disjoint windows keep the middle gap out, overlapping windows count it
    # only once.
    width_factor = math.sqrt(-2 * math.log(max(threshold, 1e-9)))
    component_bounds = [
        (
            max(lb, int(math.floor(centre - width_factor * width[0]))),
            min(rb, int(math.ceil(centre + width_factor * width[1]))),
        )
        for centre, width in zip(centres, widths)
    ]
    merged_bounds: list[list[int]] = []
    for left, right in sorted(component_bounds):
        if merged_bounds and left <= merged_bounds[-1][1]:
            merged_bounds[-1][1] = max(merged_bounds[-1][1], right)
        else:
            merged_bounds.append([left, right])
    if any(right - left < 2 for left, right in merged_bounds) or any(
        left <= neighbor_right and neighbor_left <= right
        for left, right in merged_bounds
        for neighbor_left, neighbor_right in neighbor_intervals
    ):
        return None, None
    integration_lb, integration_rb = merged_bounds[0][0], merged_bounds[-1][1]
    segments = [
        {"lb": left, "rb": right, "area": round(area_fn(signal, left, right), 4)}
        for left, right in merged_bounds
    ]
    fit_areas = [
        sum(float(np.trapezoid(component[left - lb : right - lb + 1])) for left, right in merged_bounds)
        for component in component_curves
    ]
    total_fit_area = sum(fit_areas)
    measured_area = round(sum(segment["area"] for segment in segments), 4)
    if total_fit_area <= 0 or measured_area <= 0:
        return None, None
    shares = [fit_areas[index] / total_fit_area for index in ordered]
    allocated_areas = [round(measured_area * shares[0], 4), 0.0]
    allocated_areas[1] = round(measured_area - allocated_areas[0], 4)
    separation = centres[1] - centres[0]
    rmse_single = math.sqrt(single_sse / len(y))
    rmse_double = math.sqrt(best["sse"] / len(y))
    improvement = 1 - rmse_double / max(rmse_single, 1e-9)
    def aicc(sse: float, count: int) -> float:
        n = len(y)
        return n * math.log(max(sse / n, 1e-12)) + 2 * count + 2 * count * (count + 1) / max(1, n - count - 1)
    aicc_delta = aicc(single_sse, 7) - aicc(best["sse"], 11)
    secondary_share = min(shares)
    secondary_snr = min(amplitudes) / max(noise, 1e-9)
    secondary_raw_height = min(amplitudes) * raw_contrast / 100.0
    minimum_share = 0.12 - 0.00065 * sensitivity
    minimum_improvement = 0.30 - 0.0015 * sensitivity
    checks = {
        "component_share": secondary_share >= minimum_share,
        "signal_to_noise": secondary_snr >= 6.0 - 0.02 * sensitivity,
        "raw_signal": secondary_raw_height >= 5.0,
        # A fit that merely divides one skewed apex into two nearby shapes is
        # not an independently resolved shoulder.
        "separation": separation >= max(6.0, 0.8 * max(max(pair) for pair in widths)),
        "component_width": max(max(pair) for pair in widths) <= (rb - lb) * 0.60,
        "rmse_improvement": improvement >= minimum_improvement,
        "model_selection": aicc_delta >= 12.0,
        "centres_within_fit": all(lb + 2 < centre < rb - 2 for centre in centres),
        "rf_within_solvent_lines": all(0.0 <= rf_fn(centre, len(signal)) <= 1.0 for centre in centres),
        "baseline": all(-2.0 <= value <= 105.0 for value in fitted_baseline),
    }
    fit_valid = all(checks.values())
    reason = "accepted" if fit_valid else next(name for name, passed in checks.items() if not passed)
    decision = "split" if fit_valid and override != "keep" else "keep"
    group: dict[str, Any] = {
        "id": group_id,
        "status": "resolved" if fit_valid else "unresolved",
        "reason": reason,
        "recommendation": "split" if fit_valid else "keep",
        "decision": decision,
        "active": decision == "split",
        "bounds": {"lb": int(lb), "rb": int(rb)},
        "integration_bounds": {"lb": int(integration_lb), "rb": int(integration_rb)},
        "integration_segments": segments,
        "measured_cluster_area": measured_area,
        "area_basis": "component_threshold_union",
        "width_threshold": round(threshold * 100, 4),
        "original_peak": dict(original_peak),
        "quality": {
            "noise": round(noise, 4),
            "rmse_single": round(rmse_single, 4),
            "rmse_double": round(rmse_double, 4),
            "improvement": round(improvement, 4),
            "aicc_delta": round(aicc_delta, 4),
            "separation": round(separation, 4),
            "component_share": round(secondary_share, 4),
            "snr": round(secondary_snr, 4),
            "raw_contrast": round(raw_contrast, 4),
            "local_raw_contrast": round(local_raw_contrast, 4),
            "secondary_raw_height": round(secondary_raw_height, 4),
            "checks": checks,
        },
        "baseline_curve": [round(float(value), 4) for value in fitted_baseline],
        "single_curve": [round(float(value), 4) for value in single_curve],
        "double_curve": [round(float(value), 4) for value in double_curve],
        "components": [],
    }
    replacement_peaks: list[dict[str, Any]] = []
    for output_index, source_index in enumerate(ordered):
        centre = centres[output_index]
        sample_index = int(round(centre))
        component_curve = component_curves[source_index]
        component: dict[str, Any] = {
            "peak_index": None,
            "center_idx": round(centre, 4),
            "rf": round(rf_fn(centre, len(signal)), 3),
            "area": allocated_areas[output_index],
            "fit_area": round(fit_areas[source_index], 4),
            "integration_bounds": {"lb": component_bounds[output_index][0], "rb": component_bounds[output_index][1]},
            "curve": [round(float(value), 4) for value in component_curve],
        }
        group["components"].append(component)
        replacement_peaks.append({
            "idx": sample_index,
            "rf": component["rf"],
            "height": round(float(display_signal[sample_index]), 2),
            "height_display": round(float(display_signal[sample_index]), 2),
            "height_analysis": round(float(fitted_baseline[sample_index - lb] + component_curve[sample_index - lb]), 4),
            "area": component["area"],
            "fit_area": component["fit_area"],
            "area_method": "deconvolved",
            "fit_group_id": group_id,
            "fit_component_index": output_index,
            "fit_center_idx": component["center_idx"],
            "area_lb": component_bounds[output_index][0], "area_rb": component_bounds[output_index][1],
            "display_lb": component_bounds[output_index][0], "display_rb": component_bounds[output_index][1],
            "lb": component_bounds[output_index][0], "rb": component_bounds[output_index][1],
            "manual": False,
            "type": "N",
        })
    group["split_peaks"] = [dict(peak) for peak in replacement_peaks] if fit_valid else []
    return group, replacement_peaks if fit_valid and decision == "split" else None


def fit_shoulder_group(
    signal: np.ndarray,
    display_signal: np.ndarray,
    rf_fn: Callable[[float, int], float],
    area_fn: Callable[[Any, int, int], float],
    apex: int,
    base_lb: int,
    base_rb: int,
    threshold: float,
    sensitivity: float,
    group_id: str,
    original_peak: dict[str, Any],
    neighbor_intervals: list[tuple[int, int]],
    override: str | None,
    *,
    max_peak_asymmetry: float = 1.0,
    default_asymmetry: bool = True,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]] | None]:
    """Compare one versus two peaks using the selected shoulder shape mode.

    Only a curvature-supported, statistically and materially better two-peak
    fit is allowed to replace the measured single peak. Candidate fits with
    insufficient support are exposed as unresolved, never silently accepted.
    """
    if default_asymmetry:
        return _fit_shoulder_group_original(
            signal, display_signal, rf_fn, area_fn, apex, base_lb, base_rb, threshold,
            sensitivity, group_id, original_peak, neighbor_intervals, override,
        )
    from scipy.optimize import least_squares

    if sensitivity <= 0 or base_rb - base_lb < 16:
        return None, None
    # Per-lane 0..100 normalization can amplify a nearly blank image into a
    # full-scale-looking trace. Require meaningful contrast in the measured
    # (pre-normalization) display profile before considering a split.
    raw_contrast = float(display_signal.max() - display_signal.min())

    # Fit through the low-signal shoulders, but keep the resulting measured
    # integration envelope separate from any neighbouring peak interval.
    baseline_level = min(float(signal[base_lb]), float(signal[base_rb]))
    cutoff = baseline_level + 0.025 * max(0.0, float(signal[apex]) - baseline_level)
    lb, rb = apex, apex
    while lb > base_lb and signal[lb] > cutoff:
        lb -= 1
    while rb < base_rb and signal[rb] > cutoff:
        rb += 1
    lb = max(base_lb, lb - 2)
    rb = min(base_rb, rb + 2)
    if rb - lb < 18 or rb - lb > 512 or any(lb <= right and left <= rb for left, right in neighbor_intervals):
        return None, None
    local_raw_contrast = float(np.ptp(display_signal[lb : rb + 1]))
    if local_raw_contrast < 8.0:
        return None, None

    y = np.asarray(signal[lb : rb + 1], dtype=float)
    x = np.arange(len(y), dtype=float)
    local_apex = apex - lb
    if not np.all(np.isfinite(y)) or y.max() - y.min() < 8:
        return None, None
    flat_run = np.flatnonzero(y >= y.max() * 0.985)
    if len(flat_run) >= max(7, round(len(y) * 0.08)):
        return None, None

    noise = _shoulder_noise(y)
    half_level = min(y[0], y[-1]) + 0.5 * (y[local_apex] - min(y[0], y[-1]))
    left_half = local_apex
    right_half = local_apex
    while left_half > 0 and y[left_half] >= half_level:
        left_half -= 1
    while right_half < len(y) - 1 and y[right_half] >= half_level:
        right_half += 1
    left_width = max(2.0, (local_apex - left_half) / 1.18)
    right_width = max(2.0, (right_half - local_apex) / 1.18)
    base_guess = max(0.0, min(float(y[0]), float(y[-1])))
    initial_single = np.array([base_guess, float(y[-1] - y[0]), 0.0,
                               max(1.0, float(y[local_apex] - base_guess)),
                               float(local_apex), left_width, right_width])
    single_lower = [0, -150, -150, 0, 1, 1.5, 1.5]
    single_upper = [120, 150, 150, 150, len(y) - 2, len(y), len(y)]
    def residuals(parameters: np.ndarray, count: int) -> np.ndarray:
        fitted_baseline, fitted_total, _ = _shoulder_model(x, parameters, count)
        return np.concatenate((
            fitted_total - y,
            3.0 * np.minimum(fitted_baseline, 0),
            3.0 * np.maximum(fitted_baseline - 100.0, 0),
        ))
    try:
        single_fit = least_squares(
            lambda params: residuals(params, 1),
            initial_single, bounds=(single_lower, single_upper), max_nfev=400,
        )
    except (ValueError, FloatingPointError):
        return None, None
    if not single_fit.success:
        return None, None
    _, single_curve, _ = _shoulder_model(x, single_fit.x, 1)
    candidates = _shoulder_candidates(y, single_curve, local_apex, sensitivity, noise)
    if not candidates:
        return None, None

    single_sse = float(np.sum(np.square(y - single_curve)))
    log_ratio_limit = math.log(max_peak_asymmetry)

    def limited_parameters(variables: np.ndarray) -> np.ndarray:
        """Map bounded width ratios back to the usual two-Gaussian parameters."""
        parameters = np.empty(11, dtype=float)
        parameters[:3] = variables[:3]
        stride = 3 if max_peak_asymmetry == 1 else 4
        for index in range(2):
            source = 3 + stride * index
            target = 3 + 4 * index
            parameters[target : target + 3] = variables[source : source + 3]
            left_width = float(variables[source + 2])
            parameters[target + 3] = (
                left_width if max_peak_asymmetry == 1 else
                float(np.clip(left_width * math.exp(float(variables[source + 3])), 1.5, len(y)))
            )
        return parameters

    def limited_start(parameters: np.ndarray) -> np.ndarray:
        start = list(map(float, parameters[:3]))
        for index in range(2):
            offset = 3 + 4 * index
            amplitude, centre, left_width, right_width = map(float, parameters[offset : offset + 4])
            if max_peak_asymmetry == 1:
                start.extend((amplitude, centre, math.sqrt(left_width * right_width)))
            else:
                start.extend((amplitude, centre, left_width,
                              float(np.clip(math.log(right_width / left_width),
                                            -log_ratio_limit * 0.999, log_ratio_limit * 0.999))))
        return np.asarray(start, dtype=float)

    unrestricted_sse: list[float] = []
    limited_fits: list[dict[str, Any]] = []
    for candidate in candidates:
        # Each plausible shoulder has its own centre bounds and starting fit.
        if candidate > local_apex:
            main_min, main_max = max(1, local_apex - 8), min(len(y) - 3, candidate - 3)
            second_min, second_max = max(3, local_apex + 3), min(len(y) - 2, candidate + 8)
        else:
            main_min, main_max = max(3, candidate + 3), min(len(y) - 2, local_apex + 8)
            second_min, second_max = max(1, candidate - 8), min(len(y) - 3, local_apex - 3)
        if main_min >= main_max or second_min >= second_max:
            continue
        main_start = float(np.clip(single_fit.x[4], main_min + 0.01, main_max - 0.01))
        second_start = float(np.clip(candidate, second_min + 0.01, second_max - 0.01))
        initial_double = np.array([
            *single_fit.x[:3],
            max(1.0, single_fit.x[3] * 0.8), main_start,
            max(2.0, single_fit.x[5] * 0.9), max(2.0, single_fit.x[6] * 0.9),
            max(1.0, float(y[candidate] - single_curve[candidate]) * 2.0,
                single_fit.x[3] * 0.2),
            second_start, max(2.0, min(single_fit.x[5], len(y) / 5)),
            max(2.0, min(single_fit.x[6], len(y) / 5)),
        ])
        double_lower = [0, -150, -150, 0, main_min, 1.5, 1.5, 0, second_min, 1.5, 1.5]
        double_upper = [120, 150, 150, 150, main_max, len(y), len(y),
                        150, second_max, len(y), len(y)]
        unrestricted_fit = None
        try:
            attempt = least_squares(
                lambda params: residuals(params, 2),
                initial_double, bounds=(double_lower, double_upper), max_nfev=700,
            )
            if attempt.success:
                unrestricted_fit = attempt
                _, unrestricted_curve, _ = _shoulder_model(x, attempt.x, 2)
                unrestricted_sse.append(float(np.sum(np.square(y - unrestricted_curve))))
        except (ValueError, FloatingPointError):
            pass

        if unrestricted_fit is not None and max_peak_asymmetry > 1 and all(
            max(unrestricted_fit.x[5 + 4 * index], unrestricted_fit.x[6 + 4 * index]) /
            min(unrestricted_fit.x[5 + 4 * index], unrestricted_fit.x[6 + 4 * index])
            <= max_peak_asymmetry
            for index in range(2)
        ):
            fitted_baseline, double_curve, component_curves = _shoulder_model(x, unrestricted_fit.x, 2)
            limited_fits.append({
                "parameters": unrestricted_fit.x,
                "baseline": fitted_baseline,
                "curve": double_curve,
                "components": component_curves,
                "sse": float(np.sum(np.square(y - double_curve))),
                "candidate": candidate,
            })
            continue

        limited_lower = [0, -150, -150]
        limited_upper = [120, 150, 150]
        for centre_min, centre_max in ((main_min, main_max), (second_min, second_max)):
            limited_lower.extend((0, centre_min, 1.5))
            limited_upper.extend((150, centre_max, len(y)))
            if max_peak_asymmetry > 1:
                limited_lower.append(-log_ratio_limit)
                limited_upper.append(log_ratio_limit)
        def limited_residuals(variables: np.ndarray) -> np.ndarray:
            return residuals(limited_parameters(variables), 2)
        starts = [limited_start(initial_double)]
        if unrestricted_fit is not None:
            alternative_start = limited_start(unrestricted_fit.x)
            if not np.allclose(alternative_start, starts[0], rtol=1e-8, atol=1e-8):
                starts.append(alternative_start)
        starts.sort(key=lambda value: float(np.sum(np.square(limited_residuals(value)))))
        for initial_limited in starts:
            try:
                limited_fit = least_squares(
                    limited_residuals, initial_limited,
                    bounds=(limited_lower, limited_upper), max_nfev=500,
                )
            except (ValueError, FloatingPointError):
                continue
            if not limited_fit.success:
                continue
            limited_params = limited_parameters(limited_fit.x)
            fitted_baseline, double_curve, component_curves = _shoulder_model(x, limited_params, 2)
            limited_sse = float(np.sum(np.square(y - double_curve)))
            limited_fits.append({
                "parameters": limited_params,
                "baseline": fitted_baseline,
                "curve": double_curve,
                "components": component_curves,
                "sse": limited_sse,
                "candidate": candidate,
            })
    if not limited_fits:
        return None, None
    # A constrained attempt may converge to a better local minimum than the
    # unrestricted attempt from another start; it is also a valid reference fit.
    reference_sse = min([*unrestricted_sse, *(fit["sse"] for fit in limited_fits)])

    def aicc(sse: float, count: int) -> float:
        n = len(y)
        return n * math.log(max(sse / n, 1e-12)) + 2 * count + 2 * count * (count + 1) / max(1, n - count - 1)

    def evaluate_fit(fit: dict[str, Any]) -> dict[str, Any] | None:
        params = fit["parameters"]
        fitted_baseline = fit["baseline"]
        component_curves = fit["components"]
        ordered = sorted(range(2), key=lambda index: params[4 + 4 * index])
        centres = [float(params[4 + 4 * index] + lb) for index in ordered]
        widths = [(float(params[5 + 4 * index]), float(params[6 + 4 * index])) for index in ordered]
        amplitudes = [float(params[3 + 4 * index]) for index in ordered]
        ratios = [max(pair) / min(pair) for pair in widths]
        # Width % controls the measured-area union, independently of fit support.
        width_factor = math.sqrt(-2 * math.log(max(threshold, 1e-9)))
        component_bounds = [
            (max(lb, int(math.floor(centre - width_factor * width[0]))),
             min(rb, int(math.ceil(centre + width_factor * width[1]))))
            for centre, width in zip(centres, widths)
        ]
        merged_bounds: list[list[int]] = []
        for left, right in sorted(component_bounds):
            if merged_bounds and left <= merged_bounds[-1][1]:
                merged_bounds[-1][1] = max(merged_bounds[-1][1], right)
            else:
                merged_bounds.append([left, right])
        if any(right - left < 2 for left, right in merged_bounds) or any(
            left <= neighbor_right and neighbor_left <= right
            for left, right in merged_bounds
            for neighbor_left, neighbor_right in neighbor_intervals
        ):
            return None
        integration_lb, integration_rb = merged_bounds[0][0], merged_bounds[-1][1]
        segments = [
            {"lb": left, "rb": right, "area": round(area_fn(signal, left, right), 4)}
            for left, right in merged_bounds
        ]
        fit_areas = [
            sum(float(np.trapezoid(component[left - lb : right - lb + 1])) for left, right in merged_bounds)
            for component in component_curves
        ]
        total_fit_area = sum(fit_areas)
        measured_area = round(sum(segment["area"] for segment in segments), 4)
        if total_fit_area <= 0 or measured_area <= 0:
            return None
        shares = [fit_areas[index] / total_fit_area for index in ordered]
        allocated_areas = [round(measured_area * shares[0], 4), 0.0]
        allocated_areas[1] = round(measured_area - allocated_areas[0], 4)
        separation = centres[1] - centres[0]
        rmse_single = math.sqrt(single_sse / len(y))
        rmse_double = math.sqrt(fit["sse"] / len(y))
        improvement = 1 - rmse_double / max(rmse_single, 1e-9)
        aicc_delta = aicc(single_sse, 7) - aicc(fit["sse"], 9 if max_peak_asymmetry == 1 else 11)
        secondary_share = min(shares)
        secondary_snr = min(amplitudes) / max(noise, 1e-9)
        secondary_raw_height = min(amplitudes) * raw_contrast / 100.0
        checks = {
            "fit_quality_vs_unrestricted": fit["sse"] <= reference_sse * 1.05 + 1e-9,
            "component_share": secondary_share >= 0.12 - 0.00065 * sensitivity,
            "signal_to_noise": secondary_snr >= 6.0 - 0.02 * sensitivity,
            "raw_signal": secondary_raw_height >= 5.0,
            "separation": separation >= max(6.0, 0.8 * max(max(pair) for pair in widths)),
            "component_width": max(max(pair) for pair in widths) <= (rb - lb) * 0.60,
            "rmse_improvement": improvement >= 0.30 - 0.0015 * sensitivity,
            "model_selection": aicc_delta >= 12.0,
            "centres_within_fit": all(lb + 2 < centre < rb - 2 for centre in centres),
            "rf_within_solvent_lines": all(0.0 <= rf_fn(centre, len(signal)) <= 1.0 for centre in centres),
            "baseline": all(-2.0 <= value <= 105.0 for value in fitted_baseline),
        }
        return {**fit, "ordered": ordered, "centres": centres, "widths": widths,
                "component_bounds": component_bounds, "integration_lb": integration_lb,
                "integration_rb": integration_rb, "segments": segments, "fit_areas": fit_areas,
                "measured_area": measured_area, "allocated_areas": allocated_areas,
                "rmse_single": rmse_single, "rmse_double": rmse_double, "improvement": improvement,
                "aicc_delta": aicc_delta, "separation": separation, "secondary_share": secondary_share,
                "secondary_snr": secondary_snr, "secondary_raw_height": secondary_raw_height,
                "ratios": ratios, "checks": checks, "fit_valid": all(checks.values())}

    evaluated = [result for fit in limited_fits if (result := evaluate_fit(fit)) is not None]
    if not evaluated:
        return None, None
    valid = [fit for fit in evaluated if fit["fit_valid"]]
    best = min(valid if valid else evaluated, key=lambda fit: fit["sse"])
    fitted_baseline = best["baseline"]
    double_curve = best["curve"]
    component_curves = best["components"]
    ordered = best["ordered"]
    centres = best["centres"]
    component_bounds = best["component_bounds"]
    integration_lb, integration_rb = best["integration_lb"], best["integration_rb"]
    segments = best["segments"]
    fit_areas = best["fit_areas"]
    measured_area = best["measured_area"]
    allocated_areas = best["allocated_areas"]
    rmse_single, rmse_double = best["rmse_single"], best["rmse_double"]
    improvement, aicc_delta = best["improvement"], best["aicc_delta"]
    separation = best["separation"]
    secondary_share, secondary_snr = best["secondary_share"], best["secondary_snr"]
    secondary_raw_height = best["secondary_raw_height"]
    checks = best["checks"]
    fit_valid = best["fit_valid"]
    reason = "accepted" if fit_valid else next(name for name, passed in checks.items() if not passed)
    decision = "split" if fit_valid and override != "keep" else "keep"
    group: dict[str, Any] = {
        "id": group_id,
        "status": "resolved" if fit_valid else "unresolved",
        "reason": reason,
        "recommendation": "split" if fit_valid else "keep",
        "decision": decision,
        "active": decision == "split",
        "bounds": {"lb": int(lb), "rb": int(rb)},
        "integration_bounds": {"lb": int(integration_lb), "rb": int(integration_rb)},
        "integration_segments": segments,
        "measured_cluster_area": measured_area,
        "area_basis": "component_threshold_union",
        "width_threshold": round(threshold * 100, 4),
        "original_peak": dict(original_peak),
        "quality": {
            "noise": round(noise, 4),
            "max_peak_asymmetry": round(max_peak_asymmetry, 4),
            "component_asymmetry": [round(ratio, 4) for ratio in best["ratios"]],
            "max_fitted_asymmetry": round(max(best["ratios"]), 4),
            "sse_unrestricted": round(reference_sse, 6),
            "sse_constrained": round(best["sse"], 6),
            "fit_loss_pct": round(100 * max(0.0, best["sse"] - reference_sse) / max(reference_sse, 1e-9), 3),
            "rmse_single": round(rmse_single, 4),
            "rmse_double": round(rmse_double, 4),
            "improvement": round(improvement, 4),
            "aicc_delta": round(aicc_delta, 4),
            "separation": round(separation, 4),
            "component_share": round(secondary_share, 4),
            "snr": round(secondary_snr, 4),
            "raw_contrast": round(raw_contrast, 4),
            "local_raw_contrast": round(local_raw_contrast, 4),
            "secondary_raw_height": round(secondary_raw_height, 4),
            "checks": checks,
        },
        "baseline_curve": [round(float(value), 4) for value in fitted_baseline],
        "single_curve": [round(float(value), 4) for value in single_curve],
        "double_curve": [round(float(value), 4) for value in double_curve],
        "components": [],
    }
    replacement_peaks: list[dict[str, Any]] = []
    for output_index, source_index in enumerate(ordered):
        centre = centres[output_index]
        sample_index = int(round(centre))
        component_curve = component_curves[source_index]
        component: dict[str, Any] = {
            "peak_index": None,
            "center_idx": round(centre, 4),
            "rf": round(rf_fn(centre, len(signal)), 3),
            "area": allocated_areas[output_index],
            "fit_area": round(fit_areas[source_index], 4),
            "integration_bounds": {"lb": component_bounds[output_index][0], "rb": component_bounds[output_index][1]},
            "curve": [round(float(value), 4) for value in component_curve],
        }
        group["components"].append(component)
        replacement_peaks.append({
            "idx": sample_index,
            "rf": component["rf"],
            "height": round(float(display_signal[sample_index]), 2),
            "height_display": round(float(display_signal[sample_index]), 2),
            "height_analysis": round(float(fitted_baseline[sample_index - lb] + component_curve[sample_index - lb]), 4),
            "area": component["area"],
            "fit_area": component["fit_area"],
            "area_method": "deconvolved",
            "fit_group_id": group_id,
            "fit_component_index": output_index,
            "fit_center_idx": component["center_idx"],
            "area_lb": component_bounds[output_index][0], "area_rb": component_bounds[output_index][1],
            "display_lb": component_bounds[output_index][0], "display_rb": component_bounds[output_index][1],
            "lb": component_bounds[output_index][0], "rb": component_bounds[output_index][1],
            "manual": False,
            "type": "N",
        })
    group["split_peaks"] = [dict(peak) for peak in replacement_peaks] if fit_valid else []
    return group, replacement_peaks if fit_valid and decision == "split" else None
