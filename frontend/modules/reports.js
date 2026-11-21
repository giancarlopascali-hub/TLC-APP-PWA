import { areaCalibrationQualifier, areaCalibrationSummary, buildAreaCalibration,
  buildMwCalibration, orderPeakRows, relativeQuantitation } from './calibration.js';
import { analysisProfileFor } from './analysis.js';
import { state } from './state.js';
import { analysisReady, fitCurveSeries, fitGroups, fitIntegrationSegments, isFittedPeak } from './shoulder.js';

/** The only serializer used for user-provided strings in printable reports. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

export function safeFilename(value, fallback = 'AQ-TLC_Report') {
  const cleaned = String(value ?? '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^[_ .]+|[_ .]+$/g, '');
  return (cleaned || fallback).slice(0, 80);
}

function laneChart(lane) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const profile = analysisProfileFor(lane);
  if (profile.length < 2) return canvas.toDataURL('image/png');
  const left = 80; const right = 80; const top = 90; const bottom = 110;
  const width = canvas.width - left - right; const height = canvas.height - top - bottom;
  let min = Math.min(...profile); let max = Math.max(...profile);
  fitGroups(lane).forEach(group => {
    const series = fitCurveSeries(group, profile.length); if (!series) return;
    const curves = group.active ? [series.total, ...series.components.map(component => component.curve)] : [group.single_curve];
    curves.forEach(curve => (curve || []).forEach(value => { if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } }));
  });
  const span = max - min || 1;
  const yForValue = value => top + (1 - (Number(value) - min) / span) * height;
  fitGroups(lane).filter(group => group.active).forEach(group => fitIntegrationSegments(group).forEach(segment => {
    context.fillStyle = 'rgba(144,95,196,.17)';
    context.fillRect(left + segment.lb / (profile.length - 1) * width, top,
      Math.max(0, segment.rb - segment.lb) / (profile.length - 1) * width, height);
  }));
  (lane.peaks || []).filter(peak => !isFittedPeak(peak)).forEach(peak => {
    const lb = Number(peak.display_lb ?? peak.area_lb ?? 0);
    const rb = Number(peak.display_rb ?? peak.area_rb ?? 0);
    context.fillStyle = peak.manual ? 'rgba(227,76,38,.16)' : 'rgba(255,215,0,.18)';
    context.fillRect(left + lb / (profile.length - 1) * width, top, Math.max(0, rb - lb) / (profile.length - 1) * width, height);
  });
  context.strokeStyle = '#0366d6'; context.lineWidth = 3; context.beginPath();
  profile.forEach((value, index) => {
    const x = left + index / (profile.length - 1) * width;
    const y = yForValue(value);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  const drawFit = (values, start, color, dashed = false) => {
    if (!Array.isArray(values) || !values.length) return;
    context.strokeStyle = color; context.lineWidth = dashed ? 2 : 3;
    context.setLineDash(dashed ? [8, 6] : []); context.beginPath();
    values.forEach((value, offset) => {
      const x = left + (start + offset) / (profile.length - 1) * width;
      const y = yForValue(value);
      if (offset === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke(); context.setLineDash([]);
  };
  fitGroups(lane).forEach(group => {
    const series = fitCurveSeries(group, profile.length); if (!series) return;
    if (group.active) {
      drawFit(series.total, series.lb, '#008f82');
      series.components.forEach(component => drawFit(component.curve, series.lb, '#8055b7', true));
    } else drawFit(group.single_curve, series.lb, '#697786', true);
  });
  context.fillStyle = '#222'; context.font = 'bold 24px Arial'; context.textAlign = 'center';
  context.fillText('Origin', left, canvas.height - 55); context.fillText('Solvent front', canvas.width - right, canvas.height - 55);
  return canvas.toDataURL('image/png');
}

function laneStrip(lane, sourceImage) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(lane.h || 1));
  canvas.height = Math.max(1, Math.round(lane.w || 1));
  const context = canvas.getContext('2d');
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(Math.PI / 2 - (lane.angle || 0));
  context.drawImage(sourceImage, -(lane.cx || 0), -(lane.cy || 0));
  context.restore();
  const profileLength = (lane.profile_display || []).length;
  if (profileLength > 1) fitGroups(lane).filter(group => group.active).forEach(group =>
    fitIntegrationSegments(group).forEach(segment => {
      const left = segment.lb / (profileLength - 1) * canvas.width;
      const right = segment.rb / (profileLength - 1) * canvas.width;
      context.fillStyle = 'rgba(144,95,196,.38)';
      context.fillRect(left, 0, Math.max(0, right - left), canvas.height);
    }));
  if (profileLength > 1) (lane.peaks || []).filter(peak => !isFittedPeak(peak)).forEach(peak => {
    const left = Number(peak.display_lb ?? peak.area_lb ?? 0) / (profileLength - 1) * canvas.width;
    const right = Number(peak.display_rb ?? peak.area_rb ?? 0) / (profileLength - 1) * canvas.width;
    context.fillStyle = peak.manual ? 'rgba(227,76,38,.38)' : 'rgba(255,215,0,.38)';
    context.fillRect(left, 0, Math.max(0, right - left), canvas.height);
  });
  return canvas.toDataURL('image/png');
}

export function reportRows(lane) {
  const method = state.integrationMethod;
  const areaCalibration = buildAreaCalibration(state.lanes);
  const mwCalibration = buildMwCalibration(state.lanes);
  const relative = orderPeakRows(relativeQuantitation(lane.peaks)).map(({ peak }) => peak);
  const headers = method === 'relative'
    ? ['Peak name', 'Rf', 'Area (AU)', '% area', 'Abs. ratio', '% corrected']
    : method === 'calibration'
      ? ['Peak name', 'Rf', 'Area (AU)', 'Type', 'Value']
      : ['Peak name', 'Rf', 'Area (AU)', 'Type', 'MW (kDa)'];
  const cells = relative.map((peak, index) => {
    const name = escapeHtml(peak.name || `#${index + 1}`)
      + (isFittedPeak(peak) ? '<small class="fit-area-label" style="display:block;color:#8055b7">Model allocated</small>' : '');
    const rf = Number(peak.rf || 0).toFixed(3);
    const area = Number(peak.area || 0).toFixed(1);
    if (method === 'relative') return `<tr><td>${name}</td><td>${rf}</td><td>${area}</td><td>${peak.relativePercent.toFixed(1)}%</td><td>${peak.absRatio}</td><td>${peak.correctedPercent.toFixed(1)}%</td></tr>`;
    if (method === 'calibration') {
      const estimate = peak.type === 'A' && areaCalibration.evaluate ? areaCalibration.evaluate(peak.area) : null;
      const entered = peak.calibrationValue;
      const validStandard = entered !== undefined && entered !== null && String(entered).trim() !== ''
        && Number.isFinite(Number(entered));
      const value = peak.type === 'S' ? (validStandard ? entered : 'N/A')
        : Number.isFinite(estimate) ? estimate.toFixed(2) : '—';
      const qualifier = peak.type === 'A' ? areaCalibrationQualifier(areaCalibration, peak.area, estimate) : '';
      return `<tr><td>${name}</td><td>${rf}</td><td>${area}</td><td>${escapeHtml(peak.type || 'N')}</td><td>${escapeHtml(value)}${qualifier ? `<small class="calibration-qualifier" style="display:block;color:#666">${escapeHtml(qualifier)}</small>` : ''}</td></tr>`;
    }
    const mw = peak.type === 'S' ? peak.mwValue : peak.type === 'A' && mwCalibration.evaluate ? mwCalibration.evaluate(peak.rf)?.toFixed(1) : '—';
    return `<tr><td>${name}</td><td>${rf}</td><td>${area}</td><td>${escapeHtml(peak.type || 'N')}</td><td>${escapeHtml(mw)}</td></tr>`;
  }).join('');
  const calibrationNote = method === 'calibration'
    ? `<p class="calibration-note" style="padding:8px;border:1px solid #ddd;border-radius:5px;line-height:1.4">${escapeHtml(areaCalibrationSummary(areaCalibration))}</p>`
    : '';
  return `${calibrationNote}<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
}

export function reportFitSummary(lane) {
  const groups = fitGroups(lane);
  if (!groups.length) return '';
  const cards = groups.map(group => {
    const quality = group.quality || {};
    const result = group.status === 'resolved'
      ? (group.active ? 'Split into two fitted components' : 'Single peak kept')
      : `Single peak kept; ${String(group.reason || 'insufficient evidence').replaceAll('_', ' ')}`;
    const area = Number(group.measured_cluster_area);
    const improvement = Number(quality.improvement);
    const segments = fitIntegrationSegments(group);
    return `<div class="fit-card" style="border:1px solid #b89ad3;border-radius:6px;padding:10px;margin:8px 0;break-inside:avoid"><strong>Shoulder review — ${escapeHtml(result)}</strong><p>Rf ${Number(group.original_peak?.rf ?? 0).toFixed(3)} · Width ${Number(group.width_threshold ?? state.peakThreshold).toFixed(0)}% · ${segments.length} measured interval${segments.length === 1 ? '' : 's'} · cluster ${Number.isFinite(area) ? area.toFixed(1) : '—'} AU · fit improvement ${Number.isFinite(improvement) ? (improvement * 100).toFixed(0) : '—'}%</p></div>`;
  }).join('');
  return `<section class="fit-summary" style="margin:18px 0"><h2>Shoulder review</h2>${cards}<p>Fitted component areas partition measured Width%-controlled intervals. The blue trace remains the measured profile; teal and purple lines show the fitted total and components.</p></section>`;
}

export async function exportReport(scope = 'lane') {
  if (!analysisReady(state)) throw new Error('Wait for the current analysis to finish before exporting.');
  const lanes = scope === 'all' ? state.lanes : [state.activeLane].filter(Boolean);
  if (lanes.length === 0 || !state.imgB64) throw new Error('Create at least one lane before exporting a report.');
  // Open synchronously from the button gesture. Browsers otherwise commonly
  // block the report window after the image-loading await on mobile.
  const popup = window.open('', '_blank');
  if (popup) {
    popup.opener = null;
    popup.document.open();
    popup.document.write('<!doctype html><title>AQ-TLC report</title><p style="font:16px system-ui,sans-serif;padding:24px">Preparing PDF report…</p>');
    popup.document.close();
  }
  const image = new Image();
  image.src = state.imgB64;
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The plate image is unavailable.')); });
    if (!analysisReady(state)) throw new Error('Analysis changed while the report was preparing. Wait for the update and export again.');
  const sections = lanes.map(lane => {
    const title = escapeHtml(lane.name || `Lane ${lane.id}`);
    return `<section class="report-page"><header><div><h1>AQ-TLC analytical report <small>v1.3</small></h1><p>Sample: <strong>${title}</strong></p></div><time>${escapeHtml(new Date().toLocaleString())}</time></header><div class="images"><img alt="Lane strip" src="${laneStrip(lane, image)}"><img alt="Densitogram" src="${laneChart(lane)}"></div><p class="method">Method: ${escapeHtml(state.integrationMethod)}. Ordinary areas integrate the normalized measured signal; fitted component areas partition the measured Width%-controlled interval union.</p>${reportFitSummary(lane)}${reportRows(lane)}</section>`;
  }).join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AQ-TLC analytical report</title><style>body{font:14px system-ui,sans-serif;color:#222;margin:0 auto;max-width:1100px;padding:30px}header{display:flex;justify-content:space-between;border-bottom:3px solid #0366d6;margin-bottom:22px}h1{color:#0366d6;margin:0}.images{border:1px solid #ddd;border-radius:8px;overflow:hidden}.images img{display:block;width:100%}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f6f8fa}.method{color:#555}.report-action{margin:0 0 20px;padding:9px 14px;font:600 14px system-ui,sans-serif;color:#fff;background:#0366d6;border:0;border-radius:6px}@media print{.report-page{page-break-after:always}.report-action{display:none}}</style></head><body><button class="report-action" onclick="window.print()">Print / Save as PDF</button>${sections}<script>window.addEventListener('load',function(){window.setTimeout(function(){window.print();},200);});<\/script></body></html>`;
    if (popup) {
      popup.document.open(); popup.document.write(html); popup.document.close();
      return { destination: 'print' };
    }
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${safeFilename(lanes[0]?.name)}_report.html`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { destination: 'download' };
  } catch (error) {
    popup?.close();
    throw error;
  }
}
