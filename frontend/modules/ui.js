import { $, state } from './state.js';

export function setStatus(message, kind = 'info') {
  state.status = { message, kind };
  const area = $('status-area'); if (!area) return;
  area.textContent = message; area.dataset.kind = kind;
}

export function setupTabs({ onProfile, onTable, onImage }) {
  document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => {
    const tab = button.dataset.tab; state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-content').forEach(item => item.classList.toggle('hidden', item.id !== `tab-${tab}`));
    document.querySelectorAll('.toolbar-content').forEach(item => item.classList.toggle('hidden', item.id !== `toolbar-${tab}`));
    if (tab === 'profile') onProfile?.(); else if (tab === 'table') onTable?.(); else onImage?.();
  }));
}

export function setupToolSelection() {
  document.querySelectorAll('.tool-item[data-tool]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tool-item[data-tool]').forEach(item => item.classList.toggle('active', item === button)); state.activeTool = button.dataset.tool;
  }));
}

export function setupProfileMenus({ onClear, onResetIntegration, onExportLane, onExportAll }) {
  $('btn-edit-peaks')?.addEventListener('click', () => { $('menu-view')?.classList.add('hidden'); $('menu-edit')?.classList.toggle('hidden'); });
  $('btn-reset-view')?.addEventListener('click', () => { $('menu-edit')?.classList.add('hidden'); $('menu-view')?.classList.toggle('hidden'); });
  document.querySelectorAll('.sub-item[data-pmode]').forEach(button => button.addEventListener('click', event => {
    const mode = button.dataset.pmode;
    if (mode === 'nav-1to1') { state.chartView = { zoom: 1, offset: 0 }; }
    else state.transient.profileTool = mode;
    document.querySelectorAll('.sub-item[data-pmode]').forEach(item => item.classList.toggle('active', item.dataset.pmode === state.transient.profileTool));
    button.parentElement.classList.add('hidden'); event.stopPropagation();
  }));
  $('btn-clear-peaks')?.addEventListener('click', onClear);
  $('btn-reset-integ')?.addEventListener('click', onResetIntegration);
  $('btn-export-lane')?.addEventListener('click', onExportLane);
  $('btn-full-report')?.addEventListener('click', onExportAll);
}

export function setupAnalysisControls(onChanged) {
  document.querySelectorAll('.mode-btn').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(item => item.classList.toggle('active', item === button)); state.polarityMode = button.dataset.mode; onChanged(true);
  }));
  const controls = [
    ['peak-sens', 'peakProminence'], ['peak-res', 'peakDistance'], ['peak-width', 'peakThreshold'],
  ];
  controls.forEach(([id, property]) => $(id)?.addEventListener('input', event => {
    const raw = Number(event.target.value);
    const maximum = property === 'peakProminence' ? 80 : property === 'peakDistance' ? 50 : 100;
    const minimum = property === 'peakThreshold' ? 0 : 1;
    state[property] = Math.max(minimum, Math.min(maximum, Number.isFinite(raw) ? raw : minimum));
    event.target.value = String(state[property]);
    onChanged(true);
  }));
  $('btn-restore-defaults')?.addEventListener('click', () => {
    state.peakProminence = 40; state.peakDistance = 8; state.peakThreshold = 50; syncControls(); onChanged(true);
  });
  document.querySelectorAll('.mode-item').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.mode-item').forEach(item => item.classList.toggle('active', item === button)); state.integrationMethod = button.dataset.imode; onChanged(false, 'table');
  }));
}

export function setupSettings(onChanged) {
  $('btn-settings')?.addEventListener('click', () => $('settings-sheet')?.classList.remove('hidden'));
  $('btn-close-settings')?.addEventListener('click', () => $('settings-sheet')?.classList.add('hidden'));
  $('btn-invert-colors')?.addEventListener('click', () => { state.invertColors = !state.invertColors; syncControls(); onChanged(false, 'render'); onChanged(true); });
  document.querySelectorAll('.wl-preset-btn').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.wl; state.wavelengthPreset = value; state.targetWavelength = value === 'full' ? null : Number(value); syncControls(); onChanged(false, 'render'); onChanged(true);
  }));
  $('wl-custom')?.addEventListener('change', event => {
    const value = Math.max(380, Math.min(750, Number(event.target.value) || 540)); state.wavelengthPreset = 'custom'; state.targetWavelength = value; event.target.value = String(value); syncControls(); onChanged(false, 'render'); onChanged(true);
  });
}

export function syncControls() {
  const values = { 'peak-sens': state.peakProminence, 'peak-res': state.peakDistance, 'peak-width': state.peakThreshold, 'wl-custom': state.targetWavelength ?? 540 };
  Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  document.querySelectorAll('.mode-btn').forEach(button => button.classList.toggle('active', button.dataset.mode === state.polarityMode));
  document.querySelectorAll('.mode-item').forEach(button => button.classList.toggle('active', button.dataset.imode === state.integrationMethod));
  document.querySelectorAll('.wl-preset-btn').forEach(button => button.classList.toggle('active', button.dataset.wl === state.wavelengthPreset));
  $('btn-invert-colors')?.classList.toggle('active', state.invertColors);
}

export function setBusy(action, busy) {
  const area = $('status-area'); if (!area) return;
  if (busy) setStatus(action === 'crop' ? 'Cropping image…' : 'Generating profiles…', 'busy');
}
