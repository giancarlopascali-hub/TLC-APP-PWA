import { isFiniteNumber } from './analysis.js';

function standardsFor(lanes, mapper) {
  return (lanes || []).flatMap(lane => (lane.peaks || []).filter(peak => peak.type === 'S').map(mapper));
}

/** Returns a clear user-facing validation error instead of NaN/Infinity. */
export function buildAreaCalibration(lanes) {
  const standards = standardsFor(lanes, peak => ({ area: Number(peak.area), value: Number(peak.calibrationValue) }))
    .filter(item => isFiniteNumber(item.area) && item.area > 0 && isFiniteNumber(item.value));
  if (standards.length === 0) return { evaluate: null, error: 'Add a standard with a non-zero area and a value.' };
  if (standards.length === 1) {
    const slope = standards[0].value / standards[0].area;
    return Number.isFinite(slope)
      ? { evaluate: area => Math.max(0, Number(area) * slope), error: null }
      : { evaluate: null, error: 'The standard has an invalid area.' };
  }
  const n = standards.length;
  const sumX = standards.reduce((sum, item) => sum + item.area, 0);
  const sumY = standards.reduce((sum, item) => sum + item.value, 0);
  const sumXX = standards.reduce((sum, item) => sum + item.area * item.area, 0);
  const sumXY = standards.reduce((sum, item) => sum + item.area * item.value, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return { evaluate: null, error: 'Standards need distinct non-zero areas.' };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return { evaluate: null, error: 'The calibration inputs are not valid.' };
  return { evaluate: area => Math.max(0, slope * Number(area) + intercept), error: null };
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
