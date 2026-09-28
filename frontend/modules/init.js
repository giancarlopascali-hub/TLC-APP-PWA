import { registerApiHandlers } from './api.js';
import { clearPeaks, redrawActiveChart, renderProfiles, renderTable } from './profiles.js';
import { exportReport } from './reports.js';
import { render } from './render.js';
import { importProjectFile, loadStoredProject, persistProject } from './storage.js';
import { $, state } from './state.js';
import { stReady, stSetHeight } from './streamlit_bridge.js';
import { setBusy, setStatus, setupAnalysisControls, setupProfileMenus, setupSettings, setupTabs, setupToolSelection, syncControls } from './ui.js';
import { setupCanvasEvents } from './interactions.js';
import { calculateLanes, downloadProject, handleFile, hydrateCurrentImage, receiveCrop, receiveProfiles, requestDensitograms, resetWorkspace, startNewProject, undo } from './workspace.js';

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
  restoreLocalProject();
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
  $('btn-export-project')?.addEventListener('click', downloadProject);
  $('btn-import-project')?.addEventListener('click', () => $('project-input')?.click());
  $('project-input')?.addEventListener('change', event => void importProject(event.target.files?.[0]));
}

async function importProject(file) {
  try {
    await importProjectFile(file); await hydrateCurrentImage(); persistProject(); setStatus('Project imported successfully.', 'success');
  } catch (error) { setStatus(error.message || 'The project could not be imported.', 'error'); }
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

async function restoreLocalProject() {
  const restored = loadStoredProject();
  if (!restored.ok) {
    if (restored.reason === 'corrupt') setStatus('A saved project was corrupt and was not opened.', 'error');
    return;
  }
  syncControls(); await hydrateCurrentImage(); setStatus('Recovered the last local project.', 'success');
}

async function exportWithFeedback(scope) {
  try { await exportReport(scope); setStatus('Report opened for printing or download.', 'success'); }
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
