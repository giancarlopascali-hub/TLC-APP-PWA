import { hasPendingRequests, registerApiHandlers } from './api.js';
import { clearPeaks, redrawActiveChart, renderProfiles, renderTable } from './profiles.js';
import { exportReport } from './reports.js';
import { render } from './render.js';
import { clearStoredProject, loadStoredProject, persistProject } from './storage.js';
import { $, state } from './state.js';
import { stReady, stSetHeight } from './streamlit_bridge.js';
import { setBusy, setStatus, setupAnalysisControls, setupProfileMenus, setupSettings, setupTabs, setupToolSelection, syncControls } from './ui.js';
import { setupCanvasEvents } from './interactions.js';
import { calculateLanes, handleFile, hydrateCurrentImage, receiveCrop, receiveProfiles, requestDensitograms, resetWorkspace, startNewProject, undo } from './workspace.js';

export function init() {
  registerApiHandlers({
    profiles: receiveProfiles,
    crop: receiveCrop,
    error: message => setStatus(message, 'error'),
    activity: setBusy,
  });
  setupTabs({ onProfile: renderProfiles, onTable: renderTable, onImage: render });
  setupToolSelection();
  setupAnalysisControls((recalculate, target) => {
    if (target === 'table') { renderTable(); persistProject(); return; }
    if (target === 'render') { render(); return; }
    if (recalculate) { persistProject(); requestDensitograms(true); }
  });
  setupSettings((recalculate, target) => {
    if (target === 'render') { render(); return; }
    if (recalculate) { persistProject(); requestDensitograms(true); }
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
  syncControls(); await hydrateCurrentImage(); setStatus('Restoring analysis…', 'info');
}

async function exportWithFeedback(scope) {
  try { await exportReport(scope); setStatus('PDF report opened. Use Print or Save as PDF to export it.', 'success'); }
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
