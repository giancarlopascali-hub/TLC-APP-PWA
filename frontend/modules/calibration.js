import { isFiniteNumber } from './analysis.js';

function standardsFor(lanes, mapper) {
  return (lanes || []).flatMap(lane => (lane.peaks || []).filter(peak => peak.type === 'S').map(mapper));
}

/**
 * Calibrate area against known amounts across all lanes. The origin is an
 * assumption, not a measured standard; replicate spots at one amount form one
 * level using their mean measured area.
 */
export function buildAreaCalibration(lanes) {
  const groups = new Map();
  let skippedCount = 0;
  let zeroAmountConflict = false;
  for (const lane of lanes || []) {
    for (const peak of lane.peaks || []) {
      if (peak.type !== 'S') continue;
      const entered = peak.calibrationValue;
      const value = entered === undefined || entered === null || String(entered).trim() === ''
        ? NaN : Number(entered);
      const area = Number(peak.area);
      if (value === 0 && Number.isFinite(area) && area > 0) {
        zeroAmountConflict = true;
        continue;
      }
      if (value === 0 && peak.area !== undefined && peak.area !== null && area === 0) continue;
      if (!Number.isFinite(value) || value < 0 || !Number.isFinite(area) || area <= 0) {
        skippedCount++;
        continue;
      }
      const group = groups.get(value) || { value, areaSum: 0, replicates: 0 };
      group.areaSum += area;
      group.replicates++;
      groups.set(value, group);
    }
  }

  const levels = [...groups.values()]
    .map(group => ({ value: group.value, area: group.areaSum / group.replicates, replicates: group.replicates }))
    .sort((left, right) => left.value - right.value);
  const fail = error => ({ evaluate: null, error, levels, skippedCount });
  if (zeroAmountConflict) {
    return fail('A zero-amount S standard has positive area and conflicts with the assumed zero-area origin.');
  }
  if (!levels.length) return fail('Add an S standard with a known amount and a positive measured area.');
  if (levels.some(level => !Number.isFinite(level.area))) return fail('Standard mean areas must be finite.');
  if (levels[0].area <= 1e-9 * Math.max(1, levels[0].area)) {
    return fail('The first mean standard area is too close to the assumed zero-area origin.');
  }
  if (levels.some((level, index) => index > 0 &&
      level.area - levels[index - 1].area <= 1e-9 * Math.max(1, level.area, levels[index - 1].area))) {
    return fail('Mean standard areas must increase with known amount. Check the standards and integration windows.');
  }

  const straightLine = (left, right, area) =>
    left.value + (area - left.area) * (right.value - left.value) / (right.area - left.area);
  const quadraticThrough = points => {
    const [first, middle, final] = [...points].sort((a, b) => a.area - b.area);
    const slope01 = (middle.value - first.value) / (middle.area - first.area);
    const slope12 = (final.value - middle.value) / (final.area - middle.area);
    const curvature = (slope12 - slope01) / (final.area - first.area);
    return {
      valueAt: area => first.value + slope01 * (area - first.area)
        + curvature * (area - first.area) * (area - middle.area),
      derivativeAt: area => slope01 + curvature * (2 * area - first.area - middle.area),
    };
  };
  const evaluate = inputArea => {
    const area = Number(inputArea);
    if (!Number.isFinite(area) || area < 0) return null;
    if (area === 0) return 0;
    const exact = levels.find(level => Math.abs(area - level.area) <= 1e-12 * Math.max(1, area));
    if (exact) return exact.value;
    if (levels.length === 1) return area * levels[0].value / levels[0].area;
    const last = levels.length - 1;
    if (area > levels[last].area) {
      return Math.max(0, straightLine(levels[last - 1], levels[last], area));
    }

    const origin = { area: 0, value: 0 };
    let left, right, third;
    if (area < levels[0].area) {
      [left, right, third] = [origin, levels[0], levels[1]];
    } else {
      const bracket = levels.findIndex((level, index) =>
        index < last && area > level.area && area < levels[index + 1].area);
      if (bracket < 0) return null;
      left = levels[bracket];
      right = levels[bracket + 1];
      third = levels.length === 2 ? origin
        : bracket === 0 ? levels[2] : bracket + 2 > last ? levels[bracket - 1]
          : left.area - levels[bracket - 1].area <= levels[bracket + 2].area - right.area
            ? levels[bracket - 1] : levels[bracket + 2];
    }
    const linear = straightLine(left, right, area);
    const curve = quadraticThrough([left, right, third]);
    const quadratic = curve.valueAt(area);
    const leftSlope = curve.derivativeAt(left.area);
    const rightSlope = curve.derivativeAt(right.area);
    const originTolerance = 1e-12 * Math.max(1, Math.abs(rightSlope));
    const monotone = Number.isFinite(leftSlope) && Number.isFinite(rightSlope)
      && (left.area === 0 ? leftSlope >= -originTolerance : leftSlope > 0)
      && rightSlope > 0;
    const inBracket = quadratic >= left.value - 1e-9 && quadratic <= right.value + 1e-9;
    return Math.max(0, monotone && inBracket && Number.isFinite(quadratic) ? quadratic : linear);
  };
  return { evaluate, error: null, levels, skippedCount };
}

/** Shared table/report explanation for the current calibration model. */
export function areaCalibrationSummary(model) {
  if (!model) return '';
  let description;
  if (model.error) {
    description = `Calibration unavailable: ${model.error}`;
  } else {
    const spots = model.levels.reduce((count, level) => count + level.replicates, 0);
    const pooling = `${model.levels.length} known amount level${model.levels.length === 1 ? '' : 's'} from ${spots} standard spot${spots === 1 ? '' : 's'}; replicate areas at the same amount are averaged.`;
    const method = model.levels.length === 1
      ? 'One measured level gives a proportional straight line through the assumed zero point.'
      : model.levels.length === 2
        ? 'Two measured levels and the assumed zero point define a quadratic within the standard range. A segment that bends backwards uses a straight line.'
        : 'Local three-point quadratic interpolation uses neighbouring measured levels; below the first measured level it also uses the assumed zero point. A segment that bends backwards uses a straight line.';
    const extension = model.levels.length > 1
      ? 'Above the highest standard, the last two measured levels define straight-line extrapolation.'
      : 'Values above the standard use the same proportional line.';
    description = `Area calibration: ${pooling} Zero area is assumed to mean zero amount. ${method} ${extension}`;
  }
  if (model.skippedCount) description += ` ${model.skippedCount} incomplete or invalid S spot${model.skippedCount === 1 ? ' was' : 's were'} excluded.`;
  return description;
}

/** Shared table/report qualifier for an unknown peak's calibrated amount. */
export function areaCalibrationQualifier(model, inputArea, estimate) {
  if (!model || model.error || !Number.isFinite(estimate) || !model.levels?.length) return '';
  const area = Number(inputArea);
  if (!Number.isFinite(area) || area < 0) return '';
  if (area > model.levels.at(-1).area) return model.levels.length === 1
    ? 'Proportional estimate outside standard area; use caution.'
    : 'Linear extrapolation outside standards; use caution.';
  if (area < model.levels[0].area) return model.levels.length === 1
    ? 'Proportional estimate from assumed zero point.'
    : 'Interpolation from assumed zero point.';
  return '';
}

export function buildMwCalibration(lanes) {
  const standards = standardsFor(lanes, peak => ({ rf: Number(peak.rf), logMw: Math.log10(Number(peak.mwValue)) }))
    .filter(item => isFiniteNumber(item.rf) && isFiniteNumber(item.logMw))
    .sort((a, b) => a.rf - b.rf);
  if (standards.length < 2) return { evaluate: null, error: 'Add at least two positive molecular-weight standards.' };
  if (standards.some((item, index) => index > 0 && Math.abs(item.rf - standards[index - 1].rf) < 1e-12)) {
    return { evaluate: null, error: 'Molecular-weight standards must have distinct Rf values.' };
  }
  return {
    error: null,
    evaluate: rf => {
      const x = Number(rf);
      if (!Number.isFinite(x)) return null;
      let pair = standards.slice(0, 2);
      if (x >= standards.at(-1).rf) pair = standards.slice(-2);
      else if (x > standards[0].rf) {
        for (let index = 0; index < standards.length - 1; index += 1) {
          if (x >= standards[index].rf && x <= standards[index + 1].rf) { pair = standards.slice(index, index + 2); break; }
        }
      }
      const slope = (pair[1].logMw - pair[0].logMw) / (pair[1].rf - pair[0].rf);
      const result = 10 ** (pair[0].logMw + slope * (x - pair[0].rf));
      return Number.isFinite(result) ? result : null;
    },
  };
}

export function relativeQuantitation(peaks) {
  const valid = (peaks || []).map(peak => ({ ...peak, area: Number(peak.area) || 0, absRatio: Number(peak.absRatio) || 1 }));
  const total = valid.reduce((sum, peak) => sum + Math.max(0, peak.area), 0);
  const correctedTotal = valid.reduce((sum, peak) => sum + Math.max(0, peak.area) / Math.max(Number.EPSILON, peak.absRatio), 0);
  return valid.map(peak => ({
    ...peak,
    relativePercent: total > 0 ? peak.area / total * 100 : 0,
    correctedArea: peak.area / Math.max(Number.EPSILON, peak.absRatio),
    correctedPercent: correctedTotal > 0 ? peak.area / Math.max(Number.EPSILON, peak.absRatio) / correctedTotal * 100 : 0,
  }));
}

/** Sort table/report rows by Rf without changing the stored peak order.
 * Keep sourceIndex so an edited row still updates its own peak after sorting.
 */
export function orderPeakRows(peaks) {
  return (peaks || []).map((peak, sourceIndex) => ({ peak, sourceIndex }))
    .sort((left, right) => {
      const a = Number(left.peak.rf); const b = Number(right.peak.rf);
      const aRf = Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
      const bRf = Number.isFinite(b) ? b : Number.POSITIVE_INFINITY;
      return aRf - bRf || left.sourceIndex - right.sourceIndex;
    });
}
