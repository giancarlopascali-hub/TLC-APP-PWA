import { buildAreaCalibration, buildMwCalibration, relativeQuantitation } from './calibration.js';
import { state } from './state.js';

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
  const profile = lane.profile_display || [];
  if (profile.length < 2) return canvas.toDataURL('image/png');
  const left = 80; const right = 80; const top = 90; const bottom = 110;
  const width = canvas.width - left - right; const height = canvas.height - top - bottom;
  const min = Math.min(...profile); const max = Math.max(...profile); const span = max - min || 1;
  (lane.peaks || []).forEach(peak => {
    const lb = Number(peak.display_lb ?? peak.area_lb ?? 0);
    const rb = Number(peak.display_rb ?? peak.area_rb ?? 0);
    context.fillStyle = peak.manual ? 'rgba(227,76,38,.16)' : 'rgba(255,215,0,.18)';
    context.fillRect(left + lb / (profile.length - 1) * width, top, Math.max(0, rb - lb) / (profile.length - 1) * width, height);
  });
  context.strokeStyle = '#0366d6'; context.lineWidth = 3; context.beginPath();
  profile.forEach((value, index) => {
    const x = left + index / (profile.length - 1) * width;
    const y = top + (1 - (value - min) / span) * height;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
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
  if (profileLength > 1) (lane.peaks || []).forEach(peak => {
    const left = Number(peak.display_lb ?? peak.area_lb ?? 0) / (profileLength - 1) * canvas.width;
    const right = Number(peak.display_rb ?? peak.area_rb ?? 0) / (profileLength - 1) * canvas.width;
    context.fillStyle = peak.manual ? 'rgba(227,76,38,.38)' : 'rgba(255,215,0,.38)';
    context.fillRect(left, 0, Math.max(0, right - left), canvas.height);
  });
  return canvas.toDataURL('image/png');
}

function reportRows(lane) {
  const method = state.integrationMethod;
  const areaCalibration = buildAreaCalibration(state.lanes);
  const mwCalibration = buildMwCalibration(state.lanes);
  const relative = relativeQuantitation(lane.peaks);
  const headers = method === 'relative'
    ? ['Peak name', 'Rf', 'Area (AU)', '% area', 'Abs. ratio', '% corrected']
    : method === 'calibration'
      ? ['Peak name', 'Rf', 'Area (AU)', 'Type', 'Value']
      : ['Peak name', 'Rf', 'Type', 'MW (kDa)'];
  const cells = relative.map((peak, index) => {
    const name = escapeHtml(peak.name || `#${index + 1}`);
    const rf = Number(peak.rf || 0).toFixed(3);
    const area = Number(peak.area || 0).toFixed(1);
    if (method === 'relative') return `<tr><td>${name}</td><td>${rf}</td><td>${area}</td><td>${peak.relativePercent.toFixed(1)}%</td><td>${peak.absRatio}</td><td>${peak.correctedPercent.toFixed(1)}%</td></tr>`;
    if (method === 'calibration') {
      const value = peak.type === 'S' ? peak.calibrationValue : peak.type === 'A' && areaCalibration.evaluate ? areaCalibration.evaluate(peak.area).toFixed(2) : '—';
      return `<tr><td>${name}</td><td>${rf}</td><td>${area}</td><td>${escapeHtml(peak.type || 'N')}</td><td>${escapeHtml(value)}</td></tr>`;
    }
    const mw = peak.type === 'S' ? peak.mwValue : peak.type === 'A' && mwCalibration.evaluate ? mwCalibration.evaluate(peak.rf)?.toFixed(1) : '—';
    return `<tr><td>${name}</td><td>${rf}</td><td>${escapeHtml(peak.type || 'N')}</td><td>${escapeHtml(mw)}</td></tr>`;
  }).join('');
  return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
}

export async function exportReport(scope = 'lane') {
  const lanes = scope === 'all' ? state.lanes : [state.activeLane].filter(Boolean);
  if (lanes.length === 0 || !state.imgB64) throw new Error('Create at least one lane before exporting a report.');
  const image = new Image();
  image.src = state.imgB64;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The plate image is unavailable.')); });
  const sections = lanes.map(lane => {
    const title = escapeHtml(lane.name || `Lane ${lane.id}`);
    return `<section class="report-page"><header><div><h1>AQ-TLC analytical report</h1><p>Sample: <strong>${title}</strong></p></div><time>${escapeHtml(new Date().toLocaleString())}</time></header><div class="images"><img alt="Lane strip" src="${laneStrip(lane, image)}"><img alt="Densitogram" src="${laneChart(lane)}"></div><p class="method">Method: ${escapeHtml(state.integrationMethod)}. Peak areas use normalized analytical signal and integration bounds.</p>${reportRows(lane)}</section>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AQ-TLC analytical report</title><style>body{font:14px system-ui,sans-serif;color:#222;margin:0 auto;max-width:1100px;padding:30px}header{display:flex;justify-content:space-between;border-bottom:3px solid #0366d6;margin-bottom:22px}h1{color:#0366d6;margin:0}.images{border:1px solid #ddd;border-radius:8px;overflow:hidden}.images img{display:block;width:100%}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f6f8fa}.method{color:#555}@media print{.report-page{page-break-after:always}}</style></head><body>${sections}</body></html>`;
  const popup = window.open('', '_blank', 'noopener');
  if (popup) {
    popup.document.open(); popup.document.write(html); popup.document.close();
    popup.onload = () => popup.print();
    return;
  }
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${safeFilename(lanes[0]?.name)}_report.html`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
