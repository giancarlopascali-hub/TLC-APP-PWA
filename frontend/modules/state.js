import { DEFAULT_ANALYSIS, STATUS_IDLE } from './constants.js';

/**
 * One mutable state object, shared deliberately across UI modules.  Project
 * data lives here; short-lived gesture state is kept under `transient` so it
 * is never persisted or exported.
 */
export const state = {
  imgEl: null,
  imgB64: null,
  originalB64: null,
  imgW: 0,
  imgH: 0,
  imageRotation: 0,
  lines: [],
  spottingMarks: [],
  lanes: [],
  activeTool: 'pan',
  activeTab: 'image',
  activeLine: null,
  activeLane: null,
  activeMark: null,
  view: { zoom: 1, dx: 0, dy: 0 },
  chartView: { zoom: 1, offset: 0 },
  integrationMethod: 'relative',
  undoStack: [],
  ...DEFAULT_ANALYSIS,
  status: { message: STATUS_IDLE, kind: 'info' },
  transient: {
    dragStart: null,
    mStart: { x: 0, y: 0 },
    viewStart: { dx: 0, dy: 0 },
    isPanning: false,
    isRotating: false,
    rotateStart: 0,
    editingField: null,
    roiRect: null,
    activePointers: new Map(),
    lastPinchDist: 0,
    lastMidpoint: null,
    draggingPeak: null,
    draggingBound: null,
    panningChart: null,
    zoomingChart: null,
    profileTool: 'nav-pan',
    deferredPrompt: null,
  },
};

export const $ = id => document.getElementById(id);

export function hasImage() {
  return Boolean(state.imgEl && state.imgB64 && state.imgW > 0 && state.imgH > 0);
}

export function replaceActiveReferences() {
  const laneId = state.activeLane?.id;
  state.activeLane = state.lanes.find(lane => lane.id === laneId) || state.lanes[0] || null;
  if (state.activeLine && !state.lines.includes(state.activeLine)) state.activeLine = null;
  if (state.activeMark && !state.spottingMarks.includes(state.activeMark)) state.activeMark = null;
}
