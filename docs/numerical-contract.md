# AQ-TLC Mobile numerical contract

This document is the shared contract for the mobile Python backend and browser
calculation helpers.  Synthetic cases in
`tests/fixtures/numerical_cases.json` are the minimum conformance set.

## RGB projection window

The default **Full RGB** setting shows the original image and uses the normal
RGB-to-grayscale conversion for analysis. A preset or custom target accepts
380–750 nm. The **Window ±nm** control accepts 0–50 nm and defaults to 0.
Both values are checked against their raw limits and rounded to the nearest
integer with `floor(value + 0.5)` before calculation.

For a target `c` and half-width `w`, sample every integer nm from
`max(380, c-w)` through `min(750, c+w)`, inclusive. Average the existing
`wavelength_to_rgb` red, green, and blue responses over these samples. The
preview uses that averaged RGB vector as its tint. Analysis divides each
component by the vector sum, then applies those three normalized weights to
the photo's RGB pixels to form grayscale. Window 0 therefore preserves the
previous target-only result. Full RGB ignores the window. Invert is applied
after projection. Filter changes rerun automatic peak detection, replacing
manual peak edits in the current lanes.

This is a digital weighting of a three-channel photograph. The target and
window labels do not describe measured light at those wavelengths or a
physical spectral bandwidth.

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
  "area_lb": 134,
  "area_rb": 150,
  "display_lb": 134,
  "display_rb": 150,
  "manual": false,
  "type": "N"
}
```

`area_lb` and `area_rb` are the inclusive, Width-controlled integration bounds.
The editable peak handles refer to these two values. `display_lb` and
`display_rb` are compatibility aliases with identical values; the application
has only one visible and analytical boundary set.

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
