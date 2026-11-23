import { hasPendingRequests, registerApiHandlers } from './api.js';
import { applyCommonLaneWidth } from './lane_width.js';
import { clearPeaks, redrawActiveChart, renderProfiles, renderTable } from './profiles.js';
import { exportReport } from './reports.js';
import { render } from './render.js';
import { clearStoredProject, loadStoredProject, persistProject, saveUndoSnapshot } from './storage.js';
import { $, state } from './state.js';
import { analysisReady, normalizeMaxPeakAsymmetry, normalizeShoulderSensitivity } from './shoulder.js';
import { stReady, stSetHeight } from './streamlit_bridge.js';
import { setBusy, setStatus, setupAnalysisControls, setupProfileMenus, setupSettings, setupTabs, setupToolSelection, syncControls } from './ui.js';
import { setupCanvasEvents } from './interactions.js';
import { calculateLanes, handleFile, hydrateCurrentImage, receiveCrop, receiveProfiles, requestDensitograms, resetWorkspace, startNewProject, undo } from './workspace.js';

export function init() {
  registerApiHandlers({
    profiles: receiveProfiles,
    crop: receiveCrop,
    error: message => {
      if (state.isProfilePending) { state.isProfilePending = false; state.isProfileStale = true; renderProfiles(); }
      setStatus(message, 'error');
    },
    activity: (action, busy) => {
      setBusy(action, busy);
      if (action === 'generate_profiles') {
        state.isProfilePending = busy;
        if (busy) {
          state.isProfileStale = true;
          state.transient.draggingPeak = null; state.transient.draggingBound = null;
          state.transient.panningChart = null; state.transient.zoomingChart = null;
        }
        renderProfiles();
        for (const id of ['btn-export-lane', 'btn-full-report']) {
          const button = $(id); if (button) button.disabled = !analysisReady(state);
        }
      }
    },
  });
  setupTabs({ onProfile: renderProfiles, onTable: renderTable, onImage: render });
  setupToolSelection();
  setupAnalysisControls((recalculate, target) => {
    if (target === 'table') { renderTable(); persistProject(); return; }
    if (target === 'render') { render(); return; }
    if (recalculate) { persistProject(); requestDensitograms(true); }
  });
  let laneWidthUndoSaved = false;
  let laneWidthChanged = false;
  const changeLaneWidth = requested => {
    if (Number(requested) === state.laneWidth) return;
    if (!laneWidthUndoSaved) {
      saveUndoSnapshot();
      laneWidthUndoSaved = true;
    }
    if (applyCommonLaneWidth(state, requested)) {
      laneWidthChanged = true;
      syncControls();
      render();
      persistProject();
      requestDensitograms(true);
    }
  };
  setupSettings((recalculate, target) => {
    if (target === 'render') { render(); return; }
    if (recalculate) { persistProject(); requestDensitograms(true); }
  }, changeLaneWidth, requested => {
    changeLaneWidth(requested);
    laneWidthUndoSaved = false;
    if (laneWidthChanged && state.lanes.length) requestDensitograms(true, { coalesce: false });
    laneWidthChanged = false;
  }, requested => {
    const next = normalizeShoulderSensitivity(requested);
    if (next === state.shoulderSensitivity) return;
    saveUndoSnapshot();
    state.shoulderSensitivity = next;
    state.fitOverrides = {};
    syncControls(); persistProject(); requestDensitograms(true, { coalesce: false });
  }, (kind, requested) => {
    const property = kind === 'default' ? 'defaultAsymmetry' : 'maxPeakAsymmetry';
    const next = kind === 'default' ? Boolean(requested) : normalizeMaxPeakAsymmetry(requested);
    if (state[property] === next) return;
    saveUndoSnapshot();
    state[property] = next;
    state.fitOverrides = {};
    syncControls(); persistProject(); requestDensitograms(true, { coalesce: false });
  });
  setupProfileMenus({
    onClear: clearPeaks,
    onResetIntegration: () => requestDensitograms(true, { coalesce: false }),
    onExportLane: () => void exportWithFeedback('lane'),
    onExportAll: () => void exportWithFeedback('all'),
  });
  bindWorkspaceControls();
  setupCanvasEvents();
  bindInstallPrompt();
  syncControls();
  render();
  stReady();
  resizeComponent();
  window.addEventListener('resize', resizeComponent);
  window.addEventListener('orientationchange', resizeComponent);
  window.visualViewport?.addEventListener('resize', resizeComponent);
  restoreInFlightProject();
}

function bindWorkspaceControls() {
  $('btn-upload')?.addEventListener('click', () => $('file-input')?.click());
  $('btn-camera')?.addEventListener('click', () => $('camera-input')?.click());
  $('file-input')?.addEventListener('change', event => void handleFile(event.target.files?.[0]));
  $('camera-input')?.addEventListener('change', event => void handleFile(event.target.files?.[0]));
  $('btn-new')?.addEventListener('click', () => { if (window.confirm('Discard the current analysis and start a new one?')) startNewProject(); });
  $('btn-reset')?.addEventListener('click', () => void resetWorkspace());
  $('btn-undo')?.addEventListener('click', () => void undo());
  $('btn-find-lanes')?.addEventListener('click', calculateLanes);
}

function bindInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); state.transient.deferredPrompt = event; $('btn-install')?.classList.remove('hidden');
  });
  $('btn-install')?.addEventListener('click', async () => {
    const prompt = state.transient.deferredPrompt; if (!prompt) return;
    await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') { $('btn-install')?.classList.add('hidden'); state.transient.deferredPrompt = null; }
  });
}

async function restoreInFlightProject() {
  // The normal lifecycle is deliberately a fresh landing page. The only
  // exception is Streamlit recreating its iframe while an analysis response is
  // on its way back; that short hand-off needs the annotations to be restored.
  if (!hasPendingRequests()) {
    clearStoredProject();
    return;
  }
  const restored = loadStoredProject();
  if (!restored.ok) {
    if (restored.reason === 'corrupt') setStatus('A temporary analysis workspace was corrupt and could not be restored.', 'error');
    return;
  }
  state.isProfilePending = true; state.isProfileStale = true;
  syncControls(); await hydrateCurrentImage(); setStatus('Restoring analysis…', 'info');
}

async function exportWithFeedback(scope) {
  try {
    if (!analysisReady(state)) throw new Error('Wait for the current analysis to finish before exporting.');
    const result = await exportReport(scope);
    setStatus(result?.destination === 'download'
      ? 'Printable report downloaded. Open it and use Print or Save as PDF.'
      : 'PDF report opened. Use Print or Save as PDF to export it.', 'success');
  }
  catch (error) { setStatus(error.message || 'The report could not be created.', 'error'); }
}

function resizeComponent() {
  // The parent host constrains the iframe to its dynamic viewport. Echo the
  // component's actual visible height so orientation and virtual-keyboard
  // changes do not revive a tall, scroll-trapping iframe.
  const height = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight));
  stSetHeight(height);
  redrawActiveChart();
}
