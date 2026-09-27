import { MAX_CLIENT_IMAGE_EDGE, MAX_CLIENT_UPLOAD_BYTES } from './constants.js';
import { imageCanvasPosition, normaliseRect } from './coords.js';
import { migrateLaneSchema, remeasurePeak } from './analysis.js';
import { buildProfilePayload, requestCrop, requestProfiles } from './api.js';
import { clearStoredProject, exportedProjectText, persistProject, restoreProject, saveUndoSnapshot } from './storage.js';
import { $, replaceActiveReferences, state } from './state.js';
import { render } from './render.js';
import { renderProfiles, renderTable } from './profiles.js';
import { setStatus, syncControls } from './ui.js';

export async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { setStatus('Choose a supported image file.', 'error'); return; }
  if (file.size > MAX_CLIENT_UPLOAD_BYTES) { setStatus('This image is too large to process on a mobile device. Use an image below 16 MB.', 'error'); return; }
  try {
    const raw = await readFileAsDataUrl(file);
    const image = await loadImage(raw);
    const scale = Math.min(1, MAX_CLIENT_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale)); const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', .9);
    setImage(dataUrl, { original: dataUrl, clearAnnotations: true });
    $('view-landing')?.classList.add('hidden'); $('view-workspace')?.classList.remove('hidden');
    persistAndRender(); setStatus('Image loaded. Mark origin and solvent-front lines to continue.', 'success');
  } catch (error) { setStatus(error.message || 'The image could not be loaded.', 'error'); }
}

export function setImage(dataUrl, { original = state.originalB64, clearAnnotations = false } = {}) {
  state.imgB64 = dataUrl; state.originalB64 = original || dataUrl;
  if (clearAnnotations) {
    state.lines = []; state.spottingMarks = []; state.lanes = []; state.activeLane = null; state.activeLine = null; state.activeMark = null;
    state.imageRotation = 0; state.view = { zoom: 1, dx: 0, dy: 0 }; state.chartView = { zoom: 1, offset: 0 };
  }
  return loadImage(dataUrl).then(image => {
    state.imgEl = image; state.imgW = image.naturalWidth; state.imgH = image.naturalHeight; return image;
  });
}

export async function hydrateCurrentImage() {
  if (!state.imgB64) return false;
  try {
    const image = await loadImage(state.imgB64);
    state.imgEl = image;
    state.imgW ||= image.naturalWidth; state.imgH ||= image.naturalHeight;
    $('view-landing')?.classList.add('hidden'); $('view-workspace')?.classList.remove('hidden');
    syncControls(); renderProfiles(); renderTable(); render(); return true;
  } catch { setStatus('The saved image could not be restored.', 'error'); return false; }
}

export function requestDensitograms(detectPeaks = false, { coalesce = true } = {}) {
  if (!state.lanes.length || !state.imgB64) return;
  const payload = buildProfilePayload(state.imgB64, state.lanes, state, detectPeaks);
  requestProfiles(payload, { coalesce });
}

export function receiveProfiles(data) {
  const detect = Boolean(data?._detectPeaks);
  (data?.results || []).forEach(result => {
    const lane = state.lanes.find(item => String(item.id) === String(result.id));
    if (!lane) return;
    const previous = lane.peaks || [];
    Object.assign(lane, migrateLaneSchema(result, state.peakThreshold));
    if (!detect && previous.length) {
      lane.peaks = previous.map(peak => remeasurePeak(peak, lane, state.peakThreshold));
    }
  });
  replaceActiveReferences(); persistAndRender(); setStatus('Profiles updated.', 'success');
}

export async function receiveCrop(data) {
  if (!data?.image) { setStatus('The crop result did not include an image.', 'error'); return; }
  try {
    await setImage(data.image, { original: state.originalB64, clearAnnotations: true });
    state.transient.roiRect = null; persistAndRender(); setStatus('Crop applied. Mark lines and lanes again for the cropped image.', 'success');
  } catch (error) { setStatus(error.message || 'Could not apply the crop.', 'error'); }
}

export function applyCrop() {
  const roi = state.transient.roiRect;
  if (!roi || !state.imgB64) return;
  const rectangle = normaliseRect(roi);
  if (rectangle.w <= 5 || rectangle.h <= 5) { state.transient.roiRect = null; render(); return; }
  saveUndoSnapshot();
  requestCrop({ image: state.imgB64, x: rectangle.x, y: rectangle.y, w: rectangle.w, h: rectangle.h, angle: state.imageRotation });
}

export function calculateLanes() {
  if (!state.imgW || !state.lines.length || !state.spottingMarks.length) { setStatus('Add origin/front lines and at least one spotting mark first.', 'error'); return; }
  saveUndoSnapshot(); state.lanes = [];
  const pool = [...state.lines]; const pairs = []; const scale = $('canvas-main')?.width / state.imgW || 1;
  while (pool.length >= 2) {
    const first = pool.shift(); const firstPosition = imageCanvasPosition(first.cx, first.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    let bestIndex = -1; let minimum = Infinity;
    pool.forEach((candidate, index) => {
      const position = imageCanvasPosition(candidate.cx, candidate.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
      const distance = Math.hypot(firstPosition.cx - position.cx, firstPosition.cy - position.cy);
      if (distance < minimum && Math.abs(firstPosition.cy - position.cy) > 50 * scale) { minimum = distance; bestIndex = index; }
    });
    if (bestIndex >= 0) {
      const second = pool.splice(bestIndex, 1)[0]; const secondPosition = imageCanvasPosition(second.cx, second.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
      const [front, origin] = firstPosition.cy < secondPosition.cy ? [first, second] : [second, first];
      pairs.push({ front, origin, id: pairs.length + 1 });
    }
  }
  state.spottingMarks.forEach(mark => {
    const markPosition = imageCanvasPosition(mark.x, mark.y, state.imgW, state.imgH, scale, scale, state.imageRotation);
    const pair = nearestPair(markPosition, pairs, scale);
    if (!pair) return;
    const buddies = state.spottingMarks.filter(other => nearestPair(imageCanvasPosition(other.x, other.y, state.imgW, state.imgH, scale, scale, state.imageRotation), pairs, scale) === pair)
      .sort((left, right) => imageCanvasPosition(left.x, left.y, state.imgW, state.imgH, scale, scale, state.imageRotation).cx - imageCanvasPosition(right.x, right.y, state.imgW, state.imgH, scale, scale, state.imageRotation).cx);
    const originPosition = imageCanvasPosition(pair.origin.cx, pair.origin.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    const frontPosition = imageCanvasPosition(pair.front.cx, pair.front.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    const lineWidth = Math.max(pair.origin.w, pair.front.w) * scale;
    const markIndex = buddies.indexOf(mark); const markX = markPosition.cx;
    let laneWidth = lineWidth * .75;
    if (buddies.length > 1) {
      const before = markIndex > 0 ? markX - imageCanvasPosition(buddies[markIndex - 1].x, buddies[markIndex - 1].y, state.imgW, state.imgH, scale, scale, state.imageRotation).cx : Infinity;
      const after = markIndex < buddies.length - 1 ? imageCanvasPosition(buddies[markIndex + 1].x, buddies[markIndex + 1].y, state.imgW, state.imgH, scale, scale, state.imageRotation).cx - markX : Infinity;
      laneWidth = Math.min(before, after); if (!Number.isFinite(laneWidth)) laneWidth = lineWidth / buddies.length; laneWidth *= .95;
    }
    const laneHeight = Math.abs(originPosition.cy - frontPosition.cy) * 1.10 / scale;
    const centerX = state.imgW * scale / 2; const centerY = state.imgH * scale / 2;
    const cos = Math.cos(-state.imageRotation); const sin = Math.sin(-state.imageRotation);
    const rx = (markPosition.cx - centerX) * cos - ((originPosition.cy + frontPosition.cy) / 2 - centerY) * sin;
    const ry = (markPosition.cx - centerX) * sin + ((originPosition.cy + frontPosition.cy) / 2 - centerY) * cos;
    state.lanes.push({ id: `${pair.id}.${markIndex + 1}`, cx: (rx + centerX) / scale, cy: (ry + centerY) / scale, w: laneWidth / scale, h: laneHeight, angle: -state.imageRotation, profile_display: [], profile_analysis: [], peaks: [] });
  });
  state.activeLane = state.lanes[0] || null; persistAndRender();
  if (state.activeLane) { requestDensitograms(true, { coalesce: false }); setStatus(`${state.lanes.length} lane${state.lanes.length === 1 ? '' : 's'} calculated.`, 'success'); }
  else setStatus('No lanes could be calculated. Check that lines bracket the spotting marks.', 'error');
}

function nearestPair(position, pairs, scale) {
  return pairs.reduce((best, candidate) => {
    const candidateOrigin = imageCanvasPosition(candidate.origin.cx, candidate.origin.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    if (!best) return candidate;
    const bestOrigin = imageCanvasPosition(best.origin.cx, best.origin.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    return Math.hypot(position.cx - candidateOrigin.cx, position.cy - candidateOrigin.cy) < Math.hypot(position.cx - bestOrigin.cx, position.cy - bestOrigin.cy) ? candidate : best;
  }, null);
}

export async function resetWorkspace() {
  if (!state.originalB64) return;
  saveUndoSnapshot(); state.lines = []; state.spottingMarks = []; state.lanes = []; state.activeLane = null; state.activeLine = null; state.activeMark = null; state.imageRotation = 0; state.view = { zoom: 1, dx: 0, dy: 0 };
  await setImage(state.originalB64, { original: state.originalB64, clearAnnotations: true }); persistAndRender(); setStatus('Workspace reset to the original image.', 'success');
}

export async function undo() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) { setStatus('Nothing to undo.', 'info'); return; }
  try {
    restoreProject(JSON.parse(snapshot)); await hydrateCurrentImage(); persistProject(); setStatus('Last change undone.', 'success');
  } catch { setStatus('The undo snapshot could not be restored.', 'error'); }
}

export function startNewProject() {
  clearStoredProject(); window.location.reload();
}

export function downloadProject() {
  const blob = new Blob([exportedProjectText()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'aq-tlc-project.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

function persistAndRender() { renderProfiles(); renderTable(); render(); persistProject(); }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file); }); }
function loadImage(source) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('The image could not be decoded.')); image.src = source; }); }
