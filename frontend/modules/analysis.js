import { RF_FRONT_OFFSET, RF_ORIGIN_OFFSET } from './constants.js';

export const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

export function clampIndex(value, length) {
  if (!Number.isInteger(length) || length < 1) return 0;
  const candidate = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return Math.max(0, Math.min(length - 1, candidate));
}

/**
 * Profile indices are always origin -> front in the new schema.  This helper
 * accepts a legacy lane as a read-only compatibility measure; migration makes
 * that fallback unnecessary for newly saved projects.
 */
export function analysisProfileFor(lane) {
  if (Array.isArray(lane?.profile_analysis)) return lane.profile_analysis;
  if (Array.isArray(lane?.profile)) return [...lane.profile].reverse();
  return [];
}

export function displayProfileFor(lane) {
  if (Array.isArray(lane?.profile_display)) return lane.profile_display;
  if (Array.isArray(lane?.profile)) return [...lane.profile].reverse();
  return [];
}

/** Canonical baseline-corrected trapezoidal AUC (inclusive bounds). */
export function integratePeakArea(profile, left, right) {
  if (!Array.isArray(profile) || profile.length < 2) return 0;
  const finite = profile.map(Number);
  if (finite.some(value => !Number.isFinite(value))) {
    throw new RangeError('The analysis profile contains non-finite values.');
  }
  let L = clampIndex(left, finite.length);
  let R = clampIndex(right, finite.length);
  if (R <= L) return 0;
  const base = Math.min(finite[L], finite[R]);
  let area = 0;
  for (let index = L; index < R; index += 1) {
    const a = Math.max(finite[index] - base, 0);
    const b = Math.max(finite[index + 1] - base, 0);
    area += (a + b) / 2;
  }
  return Number.isFinite(area) ? area : 0;
}

/** Find the single Width-controlled interval for display and integration. */
export function findPeakBounds(profile, apex, thresholdPercent = 50) {
  if (!Array.isArray(profile) || profile.length < 2) {
    return { area_lb: 0, area_rb: 0, display_lb: 0, display_rb: 0 };
  }
  const signal = profile.map(value => Number.isFinite(Number(value)) ? Number(value) : 0);
  const idx = clampIndex(apex, signal.length);
  let baseLeft = idx;
  let baseRight = idx;
  while (baseLeft > 0 && signal[baseLeft - 1] <= signal[baseLeft]) baseLeft -= 1;
  while (baseRight < signal.length - 1 && signal[baseRight + 1] <= signal[baseRight]) baseRight += 1;
  const baseline = Math.min(signal[baseLeft], signal[baseRight]);
  const height = Math.max(0, signal[idx] - baseline);
  const fraction = Math.max(0, Math.min(100, Number(thresholdPercent) || 0)) / 100;
  const threshold = baseline + height * fraction;
  let left = baseLeft;
  let right = baseRight;
  for (let position = idx; position > baseLeft; position -= 1) {
    if (signal[position] < threshold) { left = position; break; }
  }
  for (let position = idx; position < baseRight; position += 1) {
    if (signal[position] < threshold) { right = position; break; }
  }
  // A one-sample peak has zero formal area.  Use a neighbouring sample when
  // available so a newly added peak can be adjusted immediately.
  if (right === left && signal.length > 1) {
    if (right < signal.length - 1) right += 1;
    else left -= 1;
  }
  return { area_lb: left, area_rb: right, display_lb: left, display_rb: right };
}

export function calculateRf(index, length) {
  if (!Number.isFinite(index) || !Number.isInteger(length) || length < 2) return 0;
  const yFraction = 1 - index / (length - 1);
  return (RF_ORIGIN_OFFSET - yFraction) / (RF_ORIGIN_OFFSET - RF_FRONT_OFFSET);
}

export function normalizePeakSchema(peak, length, displayProfile, analysisProfile, thresholdPercent = 50) {
  const next = { ...(peak || {}) };
  const idx = clampIndex(next.idx, length);
  // Older responses may contain a wide AUC interval plus the desired narrow
  // Width-controlled display interval. Prefer the latter while migrating.
  const legacyLeft = next.display_lb ?? next.area_lb ?? next.lb;
  const legacyRight = next.display_rb ?? next.area_rb ?? next.rb;
  const fallback = findPeakBounds(analysisProfile, idx, thresholdPercent);
  let left = legacyLeft == null ? fallback.area_lb : clampIndex(legacyLeft, length);
  let right = legacyRight == null ? fallback.area_rb : clampIndex(legacyRight, length);
  if (right < left) [left, right] = [right, left];
  next.idx = idx;
  next.area_lb = left;
  next.area_rb = right;
  next.display_lb = left;
  next.display_rb = right;
  next.height_display = Number.isFinite(Number(next.height_display))
    ? Number(next.height_display) : Number(displayProfile?.[idx] ?? next.height ?? 0);
  next.height_analysis = Number.isFinite(Number(next.height_analysis))
    ? Number(next.height_analysis) : Number(analysisProfile?.[idx] ?? 0);
  // `height` / `lb` / `rb` are retained only for opening older projects.
  next.height = next.height_display;
  next.lb = next.area_lb;
  next.rb = next.area_rb;
  next.rf = Number.isFinite(Number(next.rf)) ? Number(next.rf) : calculateRf(idx, length);
  next.area = integratePeakArea(analysisProfile, left, right);
  delete next.area_recalculation_required;
  next.manual = Boolean(next.manual);
  next.type = ['N', 'S', 'A'].includes(next.type) ? next.type : 'N';
  return next;
}

export function remeasurePeak(peak, lane, thresholdPercent, { resetBounds = false } = {}) {
  const display = displayProfileFor(lane);
  const analysis = analysisProfileFor(lane);
  const length = analysis.length;
  if (length < 2) return normalizePeakSchema(peak, length, display, analysis, thresholdPercent);
  const next = { ...(peak || {}) };
  next.idx = clampIndex(next.idx, length);
  if (resetBounds || next.area_lb == null || next.area_rb == null) {
    Object.assign(next, findPeakBounds(analysis, next.idx, thresholdPercent));
  }
  // An apex drag changes both values even when the integration bounds remain
  // user-controlled.  Clear legacy values so schema normalisation derives
  // them from the current index rather than retaining stale measurements.
  delete next.height_display;
  delete next.height_analysis;
  delete next.height;
  delete next.rf;
  return normalizePeakSchema(next, length, display, analysis, thresholdPercent);
}

export function migrateLaneSchema(lane, thresholdPercent = 50) {
  const next = { ...(lane || {}) };
  const legacy = Array.isArray(next.profile) ? next.profile : [];
  next.profile_display = Array.isArray(next.profile_display) ? next.profile_display.map(Number) : [...legacy].reverse().map(Number);
  next.profile_analysis = Array.isArray(next.profile_analysis)
    ? next.profile_analysis.map(Number)
    : normaliseProfile(next.profile_display);
  next.profile = next.profile_display; // compatibility alias for legacy consumers only
  const length = next.profile_analysis.length;
  next.peaks = (Array.isArray(next.peaks) ? next.peaks : [])
    .map(peak => normalizePeakSchema(peak, length, next.profile_display, next.profile_analysis, thresholdPercent));
  return next;
}

export function normaliseProfile(profile) {
  if (!Array.isArray(profile) || profile.length === 0) return [];
  const values = profile.map(value => Number.isFinite(Number(value)) ? Number(value) : 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return span > 1e-9 ? values.map(value => (value - min) / span * 100) : values.map(() => 0);
}
