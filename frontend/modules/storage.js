import { PROJECT_SCHEMA_VERSION, STORAGE_KEY } from './constants.js';
import { migrateLaneSchema } from './analysis.js';
import { state, replaceActiveReferences } from './state.js';

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function projectPayload() {
  return {
    schema_version: PROJECT_SCHEMA_VERSION,
    saved_at: new Date().toISOString(),
    image: {
      current: state.imgB64,
      original: state.originalB64,
      width: state.imgW,
      height: state.imgH,
      rotation: state.imageRotation,
    },
    annotations: {
      lines: state.lines,
      spotting_marks: state.spottingMarks,
      lanes: state.lanes,
    },
    analysis: {
      integration_method: state.integrationMethod,
      polarity_mode: state.polarityMode,
      peak_prominence: state.peakProminence,
      peak_distance: state.peakDistance,
      peak_threshold: state.peakThreshold,
      target_wavelength: state.targetWavelength,
      wavelength_preset: state.wavelengthPreset,
      invert_colors: state.invertColors,
    },
  };
}

/** Convert either schema v2 or the original unversioned localStorage shape. */
export function migrateProject(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') throw new Error('The project file is not valid.');
  const source = rawProject.schema_version ? rawProject : {
    schema_version: 1,
    image: { current: rawProject.img, original: rawProject.originalImg ?? rawProject.img, width: rawProject.w, height: rawProject.h, rotation: rawProject.rotation },
    annotations: { lines: rawProject.lines, spotting_marks: rawProject.spottingMarks, lanes: rawProject.lanes },
    analysis: { integration_method: rawProject.integrationMethod, polarity_mode: rawProject.polarityMode, peak_threshold: rawProject.peakThreshold },
  };
  if (!Number.isInteger(Number(source.schema_version)) || Number(source.schema_version) > PROJECT_SCHEMA_VERSION) {
    throw new Error('This project was made with a newer version of AQ-TLC.');
  }
  const image = source.image || {};
  const annotations = source.annotations || {};
  const analysis = source.analysis || {};
  const threshold = Number(analysis.peak_threshold ?? 50);
  return {
    schema_version: PROJECT_SCHEMA_VERSION,
    image: {
      current: typeof image.current === 'string' ? image.current : null,
      original: typeof image.original === 'string' ? image.original : (typeof image.current === 'string' ? image.current : null),
      width: Math.max(0, Number(image.width) || 0),
      height: Math.max(0, Number(image.height) || 0),
      rotation: Number(image.rotation) || 0,
    },
    annotations: {
      lines: Array.isArray(annotations.lines) ? annotations.lines : [],
      spotting_marks: Array.isArray(annotations.spotting_marks) ? annotations.spotting_marks : [],
      lanes: (Array.isArray(annotations.lanes) ? annotations.lanes : []).map(lane => migrateLaneSchema(lane, threshold)),
    },
    analysis: {
      integration_method: ['relative', 'calibration', 'mw_calibration'].includes(analysis.integration_method) ? analysis.integration_method : 'relative',
      polarity_mode: ['default', 'dark', 'bright'].includes(analysis.polarity_mode) ? analysis.polarity_mode : 'default',
      peak_prominence: Math.max(1, Math.min(100, Number(analysis.peak_prominence) || 40)),
      peak_distance: Math.max(1, Math.min(50, Math.round(Number(analysis.peak_distance) || 8))),
      peak_threshold: Math.max(0, Math.min(100, Number(analysis.peak_threshold) || 50)),
      target_wavelength: Number.isFinite(Number(analysis.target_wavelength)) ? Number(analysis.target_wavelength) : null,
      wavelength_preset: typeof analysis.wavelength_preset === 'string' ? analysis.wavelength_preset : 'full',
      invert_colors: Boolean(analysis.invert_colors),
    },
  };
}

export function snapshotProject() {
  return JSON.stringify(projectPayload());
}

export function saveUndoSnapshot() {
  state.undoStack.push(snapshotProject());
  if (state.undoStack.length > 50) state.undoStack.shift();
}

export function persistProject() {
  try {
    localStorage.setItem(STORAGE_KEY, snapshotProject());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.name === 'QuotaExceededError' ? 'Storage is full. Export your project before continuing.' : 'The project could not be saved on this device.' };
  }
}

export function clearStoredProject() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* browser storage may be unavailable */ }
}

export function restoreProject(project) {
  const migrated = migrateProject(project);
  state.imgB64 = migrated.image.current;
  state.originalB64 = migrated.image.original;
  state.imgW = migrated.image.width;
  state.imgH = migrated.image.height;
  state.imageRotation = migrated.image.rotation;
  state.lines = migrated.annotations.lines;
  state.spottingMarks = migrated.annotations.spotting_marks;
  state.lanes = migrated.annotations.lanes;
  state.integrationMethod = migrated.analysis.integration_method;
  state.polarityMode = migrated.analysis.polarity_mode;
  state.peakProminence = migrated.analysis.peak_prominence;
  state.peakDistance = migrated.analysis.peak_distance;
  state.peakThreshold = migrated.analysis.peak_threshold;
  state.targetWavelength = migrated.analysis.target_wavelength;
  state.wavelengthPreset = migrated.analysis.wavelength_preset;
  state.invertColors = migrated.analysis.invert_colors;
  replaceActiveReferences();
  return migrated;
}

export function loadStoredProject() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return { ok: false, reason: 'storage-unavailable' }; }
  if (!raw) return { ok: false, reason: 'missing' };
  const parsed = safeJsonParse(raw);
  if (!parsed) return { ok: false, reason: 'corrupt' };
  try { return { ok: true, project: restoreProject(parsed) }; }
  catch (error) { return { ok: false, reason: 'invalid', error: error.message }; }
}

export function exportedProjectText() {
  return JSON.stringify(projectPayload(), null, 2);
}

export async function importProjectFile(file) {
  if (!file) throw new Error('Choose an AQ-TLC project file first.');
  if (file.size > 18 * 1024 * 1024) throw new Error('The project file is too large to import on this device.');
  const text = await file.text();
  const parsed = safeJsonParse(text);
  if (!parsed) throw new Error('The selected file is not valid JSON.');
  return restoreProject(parsed);
}
