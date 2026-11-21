import { analysisProfileFor, calculateRf, displayProfileFor, remeasurePeak } from './analysis.js';
import { areaCalibrationQualifier, areaCalibrationSummary, buildAreaCalibration,
  buildMwCalibration, orderPeakRows, relativeQuantitation } from './calibration.js';
import { render } from './render.js';
import { saveUndoSnapshot, persistProject } from './storage.js';
import { $, state } from './state.js';
import { setStatus } from './ui.js';
import { analysisReady, applyFitDecision, fitCurveSeries, fitGroups, fitIntegrationSegments,
  invalidateKeptFitGroup, isFittedPeak, isInsideActiveFit, overlapsActiveFit } from './shoulder.js';

const PADDING = Object.freeze({ left: 50, right: 50, top: 30, bottom: 40 });

function dimensions(canvas) {
  return {
    width: canvas.width - PADDING.left - PADDING.right,
    height: canvas.height - PADDING.top - PADDING.bottom,
  };
}

function plotX(index, length, width) {
  return PADDING.left + ((index / Math.max(1, length - 1)) * state.chartView.zoom + state.chartView.offset) * width;
}

function indexAt(mouseX, length, width) {
  const ratio = (((mouseX - PADDING.left) / width) - state.chartView.offset) / state.chartView.zoom;
  return Math.max(0, Math.min(length - 1, Math.round(ratio * (length - 1))));
}

function chartContext() {
  const canvas = $('chart-active');
  if (!canvas || !state.activeLane) return null;
  return { canvas, lane: state.activeLane };
}

/** Redraws the canvas in place, safe while an active pointer owns it. */
export function redrawActiveChart() {
  const current = chartContext();
  if (current) drawChart(current.canvas, current.lane);
}

export function renderProfiles({ rebuild = true } = {}) {
  const list = $('densitogram-list');
  if (!list) return;
  if (!state.activeLane) {
    list.replaceChildren(makeElement('div', { className: 'empty-state', text: 'Select a lane to view analysis.' }));
    return;
  }
  let canvas = $('chart-active');
  if (rebuild || !canvas || canvas.closest('#densitogram-list') !== list) {
    const lane = state.activeLane;
    const header = document.createElement('div');
    header.className = 'profile-header';
    const label = document.createElement('label'); label.htmlFor = 'lane-name-input'; label.textContent = 'Lane name';
    const input = document.createElement('input'); input.id = 'lane-name-input'; input.type = 'text'; input.value = lane.name || `Lane ${lane.id}`; input.maxLength = 80;
    input.addEventListener('change', () => { lane.name = input.value.trim(); persistProject(); render(); });
    const id = makeElement('span', { className: 'lane-id', text: `#${lane.id}` });
    header.append(label, input, id);
    canvas = document.createElement('canvas'); canvas.id = 'chart-active'; canvas.className = 'chart-canvas'; canvas.setAttribute('aria-label', 'Densitogram profile');
    canvas.width = Math.max(1, list.clientWidth || 320); canvas.height = 250;
    bindChartEvents(canvas);
    const review = fitReviewPanel(lane);
    list.replaceChildren(header, canvas, ...(review ? [review] : []));
  }
  drawChart(canvas, state.activeLane);
}

function makeElement(tag, { className, text } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function fitReviewPanel(lane) {
  if (state.shoulderSensitivity === 0 && analysisReady(state)) return null;
  const panel = makeElement('section', { className: 'fit-review' });
  if (!analysisReady(state)) {
    panel.append(makeElement('p', { className: 'fit-message', text: state.isProfilePending
      ? 'Updating analysis… Split, editing and export are available when it finishes.'
      : 'Analysis needs refresh. Choose Detect to retry.' }));
    return panel;
  }
  panel.append(makeElement('h3', { text: 'Shoulder review' }));
  const groups = fitGroups(lane);
  if (!groups.length) {
    panel.append(makeElement('p', { className: 'fit-message', text: 'No shoulder candidates at this sensitivity.' }));
    return panel;
  }
  for (const group of groups) {
    const card = makeElement('article', { className: 'fit-card' });
    const title = makeElement('strong', { text: group.status === 'resolved' ? 'Possible overlapping peaks' : 'Unresolved shoulder' });
    const status = makeElement('span', { className: 'fit-status', text: group.status === 'resolved'
      ? (group.active ? 'Split active' : 'Single kept') : 'Single kept' });
    const head = makeElement('div', { className: 'fit-card-head' }); head.append(title, status); card.append(head);
    const quality = group.quality || {};
    const area = Number(group.measured_cluster_area);
    const improvement = Number(quality.improvement);
    const detail = `Rf ${Number(group.original_peak?.rf ?? 0).toFixed(3)} · ${Number.isFinite(area) ? area.toFixed(1) : '—'} measured AU · ${Number.isFinite(improvement) ? (improvement * 100).toFixed(0) : '—'}% fit improvement`;
    card.append(makeElement('p', { className: 'fit-metrics', text: detail }));
    card.append(makeElement('p', { className: 'fit-metrics', text: `Width ${Number(group.width_threshold ?? state.peakThreshold).toFixed(0)}% · ${fitIntegrationSegments(group).length} measured interval${fitIntegrationSegments(group).length === 1 ? '' : 's'} · ${group.status === 'resolved' ? 'two fitted components' : String(group.reason || 'insufficient evidence').replaceAll('_', ' ')}` }));
    if (group.status === 'resolved') {
      const actions = makeElement('div', { className: 'fit-actions' });
      for (const [decision, label] of [['split', 'Split'], ['keep', 'Keep single']]) {
        const button = makeElement('button', { text: label }); button.type = 'button';
        button.className = group.decision === decision ? 'selected' : '';
        button.setAttribute('aria-pressed', String(group.decision === decision));
        button.addEventListener('click', () => {
          if (!analysisReady(state) || group.decision === decision) return;
          saveUndoSnapshot();
          if (!applyFitDecision(lane, group.id, decision)) { state.undoStack.pop(); return; }
          state.fitOverrides[group.id] = decision;
          renderProfiles(); renderTable(); render(); persistProject();
          setStatus(decision === 'split' ? 'Fitted components selected.' : 'Single peak kept.', 'success');
        });
        actions.append(button);
      }
      card.append(actions);
    }
    card.append(makeElement('p', { className: 'fit-provenance', text: 'Component areas partition the measured Width% intervals. Fitted peaks are read-only; Keep single to edit the ordinary peak.' }));
    panel.append(card);
  }
  return panel;
}

function drawChart(canvas, lane) {
  const width = Math.max(1, canvas.clientWidth || canvas.width);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== 250) canvas.height = 250;
  const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
  const profile = analysisProfileFor(lane);
  if (profile.length < 2) {
    context.fillStyle = '#8b949e'; context.font = '14px sans-serif'; context.fillText('Generate profiles to view this lane.', 20, 30); return;
  }
  const { width: plotWidth, height: plotHeight } = dimensions(canvas);
  let min = Math.min(...profile); let max = Math.max(...profile);
  if (analysisReady(state)) fitGroups(lane).forEach(group => {
    const series = fitCurveSeries(group, profile.length); if (!series) return;
    const curves = group.active ? [series.total, ...series.components.map(component => component.curve)] : [group.single_curve];
    curves.forEach(curve => (curve || []).forEach(value => { if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } }));
  });
  const span = max - min || 1;
  const yForValue = value => PADDING.top + (1 - (Number(value) - min) / span) * plotHeight;
  context.save(); context.beginPath(); context.rect(PADDING.left, PADDING.top, plotWidth, plotHeight); context.clip();
  if (analysisReady(state)) fitGroups(lane).filter(group => group.active).forEach(group => {
    fitIntegrationSegments(group).forEach(segment => {
      const x0 = plotX(segment.lb, profile.length, plotWidth);
      const x1 = plotX(segment.rb, profile.length, plotWidth);
      context.fillStyle = 'rgba(188,140,255,.18)';
      context.fillRect(x0, PADDING.top, Math.max(0, x1 - x0), plotHeight);
    });
  });
  (analysisReady(state) ? lane.peaks || [] : []).filter(peak => !isFittedPeak(peak)).forEach(peak => {
    const left = Number(peak.area_lb ?? peak.display_lb ?? peak.lb ?? 0);
    const right = Number(peak.area_rb ?? peak.display_rb ?? peak.rb ?? 0);
    const color = peak.manual ? '#e34c26' : '#ffd700';
    context.fillStyle = peak.manual ? 'rgba(227,76,38,.18)' : 'rgba(255,215,0,.18)';
    context.fillRect(plotX(left, profile.length, plotWidth), PADDING.top, Math.max(0, plotX(right, profile.length, plotWidth) - plotX(left, profile.length, plotWidth)), plotHeight);
    context.strokeStyle = color; context.lineWidth = 2;
    [left, right].forEach(bound => { const x = plotX(bound, profile.length, plotWidth); context.beginPath(); context.moveTo(x, PADDING.top); context.lineTo(x, PADDING.top + plotHeight); context.stroke(); });
  });
  context.strokeStyle = '#58a6ff'; context.lineWidth = 2; context.beginPath();
  profile.forEach((value, index) => {
    const x = plotX(index, profile.length, plotWidth);
    const y = yForValue(value);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  if (analysisReady(state)) {
    const drawFitCurve = (values, lb, color, dashed = false, lineWidth = 2) => {
      if (!Array.isArray(values) || !values.length) return;
      context.strokeStyle = color; context.lineWidth = lineWidth; context.setLineDash(dashed ? [5, 4] : []);
      context.beginPath();
      values.forEach((value, offset) => {
        const x = plotX(lb + offset, profile.length, plotWidth);
        const y = yForValue(value);
        if (offset === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke(); context.setLineDash([]);
    };
    fitGroups(lane).forEach(group => {
      const series = fitCurveSeries(group, profile.length);
      if (!series) return;
      if (group.active) {
        drawFitCurve(series.total, series.lb, '#23d5b9', false, 2.5);
        series.components.forEach(component => drawFitCurve(component.curve, series.lb, '#bc8cff', true, 2));
      } else if (Array.isArray(group.single_curve)) {
        drawFitCurve(group.single_curve, series.lb, '#9aabbb', true, 1.5);
      }
    });
  }
  (analysisReady(state) ? lane.peaks || [] : []).forEach(peak => {
    const x = plotX(Number(peak.idx), profile.length, plotWidth);
    const height = Number(peak.height_analysis ?? profile[peak.idx] ?? 0);
    const y = yForValue(height);
    const color = peak.manual ? '#e34c26' : '#ffd700';
    context.fillStyle = color; context.strokeStyle = color; context.setLineDash([5, 3]); context.beginPath(); context.moveTo(x, y); context.lineTo(x, PADDING.top + plotHeight); context.stroke(); context.setLineDash([]);
    context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill();
    context.font = 'bold 10px sans-serif'; context.textAlign = 'center'; context.fillText(`${peak.manual ? '*' : ''}${Number(peak.rf || 0).toFixed(2)}`, x, y - 12);
  });
  context.restore();
  context.font = 'bold 11px sans-serif'; context.fillStyle = '#8b949e'; context.textAlign = 'center';
  context.fillText('ORIGIN (0.0)', PADDING.left, canvas.height - 15); context.fillText('FRONT (1.0)', canvas.width - PADDING.right, canvas.height - 15);
}

function bindChartEvents(canvas) {
  canvas.addEventListener('pointerdown', event => chartPointerDown(event, canvas));
  canvas.addEventListener('pointermove', event => chartPointerMove(event, canvas));
  canvas.addEventListener('pointerup', chartPointerUp);
  canvas.addEventListener('pointercancel', chartPointerUp);
  canvas.addEventListener('wheel', event => {
    event.preventDefault(); state.chartView.zoom = Math.max(1, state.chartView.zoom * (event.deltaY > 0 ? .9 : 1.1));
    if (state.chartView.zoom === 1) state.chartView.offset = 0; redrawActiveChart();
  }, { passive: false });
}

function chartPointerDown(event, canvas) {
  const lane = state.activeLane; const display = displayProfileFor(lane); const analysis = analysisProfileFor(lane);
  if (!analysisReady(state) || !lane || display.length < 2 || analysis.length !== display.length) return;
  canvas.setPointerCapture(event.pointerId);
  const rect = canvas.getBoundingClientRect(); const mouseX = event.clientX - rect.left; const { width } = dimensions(canvas); const index = indexAt(mouseX, display.length, width);
  const hit = findChartHit(mouseX, lane, display.length, width);
  const transient = state.transient;
  if (transient.profileTool === 'edit-add') {
    if (!validManualRf(index, display.length)) { setStatus('Manual peaks must fall between the origin and solvent front.', 'error'); return; }
    if (isInsideActiveFit(lane, index)) { setStatus('Keep the single peak before editing this fitted region.', 'error'); return; }
    try {
      const peak = remeasurePeak({ idx: index, manual: true, type: 'N' }, lane, state.peakThreshold, { resetBounds: true });
      if (overlapsActiveFit(lane, peak.area_lb, peak.area_rb)) { setStatus('Keep the single peak before adding a peak in this fitted region.', 'error'); return; }
      saveUndoSnapshot();
      lane.peaks.push(peak); updateAfterPeakChange();
    } catch { setStatus('The analysis profile is not valid for peak integration.', 'error'); }
  } else if (transient.profileTool === 'edit-move') {
    if (hit && isFittedPeak(hit.peak)) { setStatus('Fitted components are read-only. Choose Keep single to edit.', 'info'); return; }
    if (hit?.kind === 'apex') { saveUndoSnapshot(); invalidateKeptFitGroup(lane, hit.peak, state.fitOverrides); transient.draggingPeak = hit.peak; }
    if (hit?.kind === 'bound') { saveUndoSnapshot(); invalidateKeptFitGroup(lane, hit.peak, state.fitOverrides); transient.draggingBound = hit; }
  } else if (transient.profileTool === 'edit-delete' && hit?.kind === 'apex') {
    if (isFittedPeak(hit.peak)) { setStatus('Fitted components are read-only. Choose Keep single to edit.', 'info'); return; }
    saveUndoSnapshot(); invalidateKeptFitGroup(lane, hit.peak, state.fitOverrides);
    lane.peaks = lane.peaks.filter(peak => peak !== hit.peak); updateAfterPeakChange();
  } else if (transient.profileTool === 'nav-zoom') {
    transient.zoomingChart = { startX: mouseX, startZoom: state.chartView.zoom, startIndex: index };
  } else if (transient.profileTool === 'nav-pan' && state.chartView.zoom > 1) {
    transient.panningChart = { startX: mouseX, startOffset: state.chartView.offset };
  }
}

function findChartHit(mouseX, lane, length, width) {
  let closest = null;
  (lane.peaks || []).forEach(peak => {
    const candidates = [
      { kind: 'bound', side: 'lb', position: plotX(Number(peak.area_lb ?? peak.lb), length, width) },
      { kind: 'bound', side: 'rb', position: plotX(Number(peak.area_rb ?? peak.rb), length, width) },
      { kind: 'apex', position: plotX(Number(peak.idx), length, width) },
    ];
    candidates.forEach(candidate => {
      const distance = Math.abs(mouseX - candidate.position); const tolerance = candidate.kind === 'bound' ? 15 : 20;
      if (distance <= tolerance && (!closest || distance < closest.distance)) closest = { ...candidate, peak, distance };
    });
  });
  return closest;
}

function chartPointerMove(event, canvas) {
  if (!analysisReady(state)) return;
  const lane = state.activeLane; const display = displayProfileFor(lane); const analysis = analysisProfileFor(lane);
  if (!lane || display.length < 2 || analysis.length !== display.length) return;
  const transient = state.transient; const rect = canvas.getBoundingClientRect(); const mouseX = event.clientX - rect.left; const { width } = dimensions(canvas); const index = indexAt(mouseX, display.length, width);
  if (transient.draggingBound) {
    try {
      const { peak, side } = transient.draggingBound;
      const proposed = { ...peak };
      if (side === 'lb') proposed.area_lb = Math.min(Number(peak.area_rb) - 1, Math.max(0, index));
      else proposed.area_rb = Math.max(Number(peak.area_lb) + 1, Math.min(display.length - 1, index));
      proposed.display_lb = proposed.area_lb;
      proposed.display_rb = proposed.area_rb;
      proposed.lb = proposed.area_lb;
      proposed.rb = proposed.area_rb;
      const measured = remeasurePeak({ ...proposed, manual: true }, lane, state.peakThreshold);
      if (overlapsActiveFit(lane, measured.area_lb, measured.area_rb)) return;
      Object.assign(peak, measured);
      updateAfterPeakChange({ persist: false });
    } catch { setStatus('The analysis profile is not valid for peak integration.', 'error'); }
  } else if (transient.draggingPeak) {
    if (!validManualRf(index, display.length)) return;
    try {
      const measured = remeasurePeak({ ...transient.draggingPeak, idx: index, manual: true }, lane, state.peakThreshold, { resetBounds: true });
      if (overlapsActiveFit(lane, measured.area_lb, measured.area_rb)) return;
      Object.assign(transient.draggingPeak, measured);
      updateAfterPeakChange({ persist: false });
    } catch { setStatus('The analysis profile is not valid for peak integration.', 'error'); }
  } else if (transient.panningChart) {
    const delta = (mouseX - transient.panningChart.startX) / width;
    state.chartView.offset = Math.min(0, Math.max(1 - state.chartView.zoom, transient.panningChart.startOffset + delta)); redrawActiveChart();
  } else if (transient.zoomingChart) {
    const zoom = Math.max(1, transient.zoomingChart.startZoom + (mouseX - transient.zoomingChart.startX) / 50);
    state.chartView.zoom = zoom;
    state.chartView.offset = (transient.zoomingChart.startX - PADDING.left) / width - transient.zoomingChart.startIndex / (display.length - 1) * zoom;
    if (zoom === 1) state.chartView.offset = 0; redrawActiveChart();
  }
}

function validManualRf(index, length) {
  const rf = calculateRf(index, length);
  return Number.isFinite(rf) && rf >= 0 && rf <= 1;
}

function chartPointerUp() {
  const transient = state.transient;
  const changed = transient.draggingPeak || transient.draggingBound || transient.panningChart || transient.zoomingChart;
  if (changed && analysisReady(state)) persistProject();
  transient.draggingPeak = null; transient.draggingBound = null; transient.panningChart = null; transient.zoomingChart = null;
  if (changed && analysisReady(state)) renderProfiles();
}

function updateAfterPeakChange({ persist = true } = {}) {
  redrawActiveChart(); renderTable(); render(); if (persist) persistProject();
}

export function clearPeaks() {
  if (!state.activeLane) return;
  if (!analysisReady(state)) { setStatus('Wait for the current analysis before clearing peaks.', 'info'); return; }
  saveUndoSnapshot();
  for (const group of fitGroups(state.activeLane)) delete state.fitOverrides[group.id];
  state.activeLane.peaks = []; state.activeLane.fit_groups = [];
  renderProfiles(); renderTable(); render(); persistProject();
}

export function renderTable() {
  const head = $('table-head'); const body = $('table-body');
  if (!head || !body) return;
  head.replaceChildren(); body.replaceChildren();
  const lane = state.activeLane;
  if (!lane) return;
  const headers = state.integrationMethod === 'relative'
    ? ['Peak', 'Rf', 'Area', '%', 'AbsR', '% Corr']
    : state.integrationMethod === 'calibration'
      ? ['Peak', 'Rf', 'Area', 'Type', 'Value'] : ['Peak', 'Rf', 'Area', 'Type', 'MW (kDa)'];
  const headerRow = document.createElement('tr'); headers.forEach(title => headerRow.append(makeElement('th', { text: title }))); head.append(headerRow);
  if (!analysisReady(state)) { appendMessage(body, 'Analysis is updating. Peak values will appear when it finishes.', headers.length); return; }
  const areaCalibration = buildAreaCalibration(state.lanes); const mwCalibration = buildMwCalibration(state.lanes); const relative = relativeQuantitation(lane.peaks);
  if (state.integrationMethod === 'calibration') appendMessage(body, areaCalibrationSummary(areaCalibration), headers.length);
  if (state.integrationMethod === 'mw_calibration' && mwCalibration.error) appendMessage(body, mwCalibration.error, headers.length);
  orderPeakRows(relative).forEach(({ peak, sourceIndex }, displayIndex) => appendPeakRow(body, peak, sourceIndex, displayIndex, areaCalibration, mwCalibration));
}

function appendMessage(body, text, span) {
  const row = document.createElement('tr'); const cell = makeElement('td', { className: 'table-message', text }); cell.colSpan = span; row.append(cell); body.append(row);
}

function appendPeakRow(body, peak, sourceIndex, displayIndex, areaCalibration, mwCalibration) {
  const row = document.createElement('tr'); if (peak.manual) row.className = 'manual-peak-row';
  const lane = state.activeLane;
  const name = document.createElement('input'); name.type = 'text'; name.value = peak.name || `#${displayIndex + 1}`; name.maxLength = 80;
  name.addEventListener('change', () => { lane.peaks[sourceIndex].name = name.value.trim(); persistProject(); });
  const nameWrap = document.createElement('div'); nameWrap.append(name);
  if (isFittedPeak(peak)) nameWrap.append(makeElement('small', { className: 'fit-area-label', text: 'Model allocated' }));
  addCell(row, nameWrap); addCell(row, Number(peak.rf || 0).toFixed(3));
  if (state.integrationMethod === 'relative') {
    addCell(row, Number(peak.area || 0).toFixed(1)); addCell(row, `${peak.relativePercent.toFixed(1)}%`);
    const ratio = numberInput(peak.absRatio ?? 1, .1, value => { lane.peaks[sourceIndex].absRatio = value > 0 ? value : 1; renderTable(); persistProject(); });
    addCell(row, ratio); addCell(row, `${peak.correctedPercent.toFixed(1)}%`);
  } else if (state.integrationMethod === 'calibration') {
    addCell(row, Number(peak.area || 0).toFixed(1)); addCell(row, typeSelect(peak, sourceIndex));
    if (peak.type === 'S') addCell(row, numberInput(peak.calibrationValue ?? '', .01, value => { lane.peaks[sourceIndex].calibrationValue = value; renderTable(); persistProject(); }));
    else {
      const estimate = peak.type === 'A' && areaCalibration.evaluate ? areaCalibration.evaluate(peak.area) : null;
      const qualifier = peak.type === 'A' ? areaCalibrationQualifier(areaCalibration, peak.area, estimate) : '';
      const value = makeElement('span', { text: Number.isFinite(estimate) ? estimate.toFixed(2) : '—' });
      if (qualifier) {
        const note = makeElement('small', { className: 'calibration-qualifier', text: qualifier });
        note.style.display = 'block';
        note.style.color = 'var(--dim)';
        note.style.fontFamily = 'inherit';
        value.append(note);
      }
      addCell(row, value);
    }
  } else {
    addCell(row, Number(peak.area || 0).toFixed(1)); addCell(row, typeSelect(peak, sourceIndex));
    if (peak.type === 'S') addCell(row, numberInput(peak.mwValue ?? '', .1, value => { lane.peaks[sourceIndex].mwValue = value; renderTable(); persistProject(); }));
    else {
      const estimate = peak.type === 'A' && mwCalibration.evaluate ? mwCalibration.evaluate(peak.rf) : null;
      addCell(row, estimate == null ? '—' : estimate.toFixed(1));
    }
  }
  body.append(row);
}

function addCell(row, content) {
  const cell = document.createElement('td'); if (typeof content === 'string') cell.textContent = content; else cell.append(content); row.append(cell);
}

function numberInput(value, step, onChange) {
  const input = document.createElement('input'); input.type = 'number'; input.step = step; input.value = value;
  input.addEventListener('change', () => {
    if (input.value.trim() === '') { onChange(null); return; }
    const parsed = Number(input.value); if (Number.isFinite(parsed)) onChange(parsed);
  }); return input;
}

function typeSelect(peak, index) {
  const select = document.createElement('select'); ['N', 'S', 'A'].forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = type; option.selected = (peak.type || 'N') === type; select.append(option); });
  select.addEventListener('change', () => { state.activeLane.peaks[index].type = select.value; renderTable(); persistProject(); }); return select;
}
