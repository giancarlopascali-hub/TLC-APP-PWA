import { imageCanvasPosition } from './coords.js';

const DEFAULT_LANE_WIDTH = 35;

function positionedLine(line, imageWidth, imageHeight, scale, rotation) {
  return imageCanvasPosition(line.cx, line.cy, imageWidth, imageHeight, scale, scale, rotation);
}

function positionedMark(mark, imageWidth, imageHeight, scale, rotation) {
  return imageCanvasPosition(mark.x, mark.y, imageWidth, imageHeight, scale, scale, rotation);
}

function closestPairToMark(markPosition, pairs, imageWidth, imageHeight, scale, rotation, metric) {
  return pairs.reduce((best, candidate) => {
    const bestOrigin = positionedLine(best.origin, imageWidth, imageHeight, scale, rotation);
    const candidateOrigin = positionedLine(candidate.origin, imageWidth, imageHeight, scale, rotation);
    return metric(markPosition, candidateOrigin) < metric(markPosition, bestOrigin) ? candidate : best;
  }, pairs[0]);
}

/**
 * Derive image-space lane boxes with the desktop app's established geometry.
 *
 * Keeping this pure lets the mobile interface use exactly the same lane width
 * and boundary-pairing rules as the Streamlit desktop interface. The backend
 * receives the resulting boxes unchanged, so both interfaces analyse the same
 * pixels for equivalent annotations.
 */
export function buildDesktopCompatibleLanes({
  lines = [],
  spottingMarks = [],
  imageWidth,
  imageHeight,
  canvasWidth,
  imageRotation = 0,
} = {}) {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0 || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    return { pairs: [], lanes: [] };
  }

  const scale = Number.isFinite(canvasWidth / imageWidth) && canvasWidth > 0 ? canvasWidth / imageWidth : 1;
  const pool = [...lines];
  const pairs = [];

  // Pair each boundary with its closest sufficiently separated counterpart,
  // exactly as the desktop interface does. A pair stores the lower boundary
  // as the origin and the upper boundary as the solvent front.
  while (pool.length >= 2) {
    const first = pool.shift();
    const firstPosition = positionedLine(first, imageWidth, imageHeight, scale, imageRotation);
    let bestIndex = -1;
    let minimumDistance = Infinity;
    pool.forEach((candidate, index) => {
      const candidatePosition = positionedLine(candidate, imageWidth, imageHeight, scale, imageRotation);
      const distance = Math.hypot(firstPosition.cx - candidatePosition.cx, firstPosition.cy - candidatePosition.cy);
      if (distance < minimumDistance && Math.abs(firstPosition.cy - candidatePosition.cy) > 50 * scale) {
        minimumDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) continue;
    const second = pool.splice(bestIndex, 1)[0];
    const secondPosition = positionedLine(second, imageWidth, imageHeight, scale, imageRotation);
    const [front, origin] = firstPosition.cy < secondPosition.cy ? [first, second] : [second, first];
    pairs.push({ origin, front, id: pairs.length + 1 });
  }

  if (!pairs.length || !spottingMarks.length) return { pairs, lanes: [] };

  const euclideanDistance = (mark, origin) => Math.hypot(mark.cx - origin.cx, mark.cy - origin.cy);
  const horizontalDistance = (mark, origin) => Math.abs(mark.cx - origin.cx);
  const lanes = [];

  spottingMarks.forEach(mark => {
    const markPosition = positionedMark(mark, imageWidth, imageHeight, scale, imageRotation);
    const pair = closestPairToMark(markPosition, pairs, imageWidth, imageHeight, scale, imageRotation, euclideanDistance);
    if (!pair) return;

    const buddies = spottingMarks
      .filter(candidate => {
        const candidatePosition = positionedMark(candidate, imageWidth, imageHeight, scale, imageRotation);
        return closestPairToMark(candidatePosition, pairs, imageWidth, imageHeight, scale, imageRotation, horizontalDistance) === pair;
      })
      .sort((left, right) => positionedMark(left, imageWidth, imageHeight, scale, imageRotation).cx - positionedMark(right, imageWidth, imageHeight, scale, imageRotation).cx);

    const originPosition = positionedLine(pair.origin, imageWidth, imageHeight, scale, imageRotation);
    const frontPosition = positionedLine(pair.front, imageWidth, imageHeight, scale, imageRotation);
    const laneHeight = Math.abs(originPosition.cy - frontPosition.cy) * 1.10 / scale;
    const markIndex = buddies.indexOf(mark);

    let laneWidthCanvas = DEFAULT_LANE_WIDTH * scale;
    if (buddies.length > 1) {
      let minimumSpacing = Infinity;
      for (let index = 0; index < buddies.length - 1; index += 1) {
        const left = positionedMark(buddies[index], imageWidth, imageHeight, scale, imageRotation);
        const right = positionedMark(buddies[index + 1], imageWidth, imageHeight, scale, imageRotation);
        minimumSpacing = Math.min(minimumSpacing, right.cx - left.cx);
      }
      laneWidthCanvas = Math.min(DEFAULT_LANE_WIDTH * scale, minimumSpacing * .85);
    }

    const centerX = imageWidth * scale / 2;
    const centerY = imageHeight * scale / 2;
    const cos = Math.cos(-imageRotation);
    const sin = Math.sin(-imageRotation);
    const laneCanvasX = markPosition.cx;
    const laneCanvasY = (originPosition.cy + frontPosition.cy) / 2;
    const rotatedX = (laneCanvasX - centerX) * cos - (laneCanvasY - centerY) * sin;
    const rotatedY = (laneCanvasX - centerX) * sin + (laneCanvasY - centerY) * cos;

    lanes.push({
      id: `${pair.id}.${markIndex + 1}`,
      cx: (rotatedX + centerX) / scale,
      cy: (rotatedY + centerY) / scale,
      w: laneWidthCanvas / scale,
      h: laneHeight,
      angle: -imageRotation,
      profile_display: [],
      profile_analysis: [],
      peaks: [],
    });
  });

  return { pairs, lanes };
}
