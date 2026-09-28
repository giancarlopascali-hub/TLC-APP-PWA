import { MAX_CLIENT_IMAGE_EDGE, MAX_CLIENT_UPLOAD_BYTES } from './constants.js';
import { normaliseRect } from './coords.js';
import { migrateLaneSchema, remeasurePeak } from './analysis.js';
import { buildProfilePayload, clearPendingRequests, requestCrop, requestProfiles } from './api.js';
import { buildDesktopCompatibleLanes } from './lane_geometry.js';
import { clearStoredProject, persistProject, restoreProject, saveUndoSnapshot } from './storage.js';
import { $, replaceActiveReferences, state } from './state.js';
import { render } from './render.js';
import { renderProfiles, renderTable } from './profiles.js';
import { setStatus, syncControls } from './ui.js';

export async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { setStatus('Choose a supported image file.', 'error'); return; }
  if (file.size > MAX_CLIENT_UPLOAD_BYTES) { setStatus('This image is too large to process on a mobile device. Use an image below 16 MB.', 'error'); return; }
  clearPendingRequests();
  try {
    const raw = await readFileAsDataUrl(file);
    const image = await loadImage(raw);
    const scale = Math.min(1, MAX_CLIENT_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale)); const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', .9);
    // Loading the decoded canvas image is asynchronous.  Rendering before it
    // resolves leaves the workspace blank until a later interaction redraws
    // the canvas (for example, a pinch-to-zoom gesture).
    await setImage(dataUrl, { original: dataUrl, clearAnnotations: true });
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
    // A crop creates a new image, so no response calculated for the previous
    // image may be allowed to update it.
    clearPendingRequests();
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
  saveUndoSnapshot();
  const { pairs, lanes } = buildDesktopCompatibleLanes({
    lines: state.lines,
    spottingMarks: state.spottingMarks,
    imageWidth: state.imgW,
    imageHeight: state.imgH,
    canvasWidth: $('canvas-main')?.width,
    imageRotation: state.imageRotation,
  });
  state.lanes = lanes;
  if (!pairs.length) {
    persistAndRender();
    setStatus('Boundary lines could not be paired. Keep the origin and solvent-front lines vertically separated.', 'error');
    return;
  }
  state.activeLane = state.lanes[0] || null; persistAndRender();
  if (state.activeLane) { requestDensitograms(true, { coalesce: false }); setStatus(`${state.lanes.length} lane${state.lanes.length === 1 ? '' : 's'} calculated.`, 'success'); }
  else setStatus('No lanes could be calculated. Check that lines bracket the spotting marks.', 'error');
}

export async function resetWorkspace() {
  if (!state.originalB64) return;
  clearPendingRequests();
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
  clearPendingRequests(); clearStoredProject(); window.location.reload();
}

function persistAndRender() { renderProfiles(); renderTable(); render(); persistProject(); }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file); }); }
function loadImage(source) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('The image could not be decoded.')); image.src = source; }); }
