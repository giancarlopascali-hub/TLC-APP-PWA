# AQ-TLC Mobile numerical contract

This document is the shared contract for the mobile Python backend and browser
calculation helpers.  Synthetic cases in
`tests/fixtures/numerical_cases.json` are the minimum conformance set.

## Signals

For each lane, the backend returns two arrays in the same direction:

- `profile_display`: baseline-corrected and smoothed intensity, with index `0`
  at the origin and the final index at the solvent front.
- `profile_analysis`: the same signal normalised to the inclusive range
  `0–100`, also origin-to-front.

Automatic detection, manual peak editing, total areas, relative quantitation,
and calibration calculations use `profile_analysis` only.  A chart can show
either array, but drawing values must not change the analytical signal.

## Peak object

```json
{
  "idx": 142,
  "rf": 0.452,
  "height_display": 78.2,
  "height_analysis": 91.4,
  "area": 1240.5,
  "area_lb": 130,
  "area_rb": 155,
  "display_lb": 134,
  "display_rb": 150,
  "manual": false,
  "type": "N"
}
```

`area_lb` and `area_rb` are inclusive integration bounds.  The editable peak
handles refer to these two values.  `display_lb` and `display_rb` are a visual
threshold band only; they must remain within the integration bounds and must
never become the AUC interval by accident.

Manual creation and apex movement calculate fresh bounds, Rf, heights, and
area from `profile_analysis`.  Moving an integration handle recalculates area
immediately.  Deleting a peak recalculates totals and dependent calibration
values.

## Area calculation

For a normalised analysis signal `s` and inclusive bounds `L < R`:

```text
base = min(s[L], s[R])

area = sum from k=L to R-1 of
       (max(s[k] - base, 0) + max(s[k+1] - base, 0)) / 2
```

Indices are clamped to the profile range.  Short profiles and `R <= L` have
zero area.  Non-finite values are an error, not a silently rounded result.
Values retain full practical precision in storage and are rounded only for the
user interface or a report.  Units are arbitrary normalised intensity × sample
index units until a validated calibration is applied.

## Rf policy

The current lane geometry intentionally includes a five-percent padding at
each end.  For profile index `i` and profile length `n`:

```text
y = 1 - i / (n - 1)
Rf = ((1.05 / 1.10) - y) / ((1.05 / 1.10) - (0.05 / 1.10))
```

Automatic detection and manual editing reject values outside `0–1`; they do
not clamp an out-of-range peak to an apparently valid Rf.  This preserves the
established analytical region while making the edge policy explicit.

## Backend limits

The backend validates MIME/base64, decoded bytes, image dimensions/pixels,
lane count and geometry, crop geometry, and numerical parameters before costly
work.  Decoded image arrays use a byte-bounded LRU cache.  These limits protect
the Streamlit worker; the browser should downscale a photo before submission.
