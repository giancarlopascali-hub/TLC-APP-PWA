import { canvasToImagePosition, distance, imageCanvasPosition, midpoint } from './coords.js';
import { saveUndoSnapshot, persistProject } from './storage.js';
import { $, state } from './state.js';
import { render } from './render.js';
import { renderProfiles, renderTable } from './profiles.js';
import { applyCrop } from './workspace.js';

export function setupCanvasEvents() {
  const canvas = $('canvas-main'); if (!canvas) return;
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('dblclick', doubleClick); canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp); canvas.addEventListener('contextmenu', event => event.preventDefault());
}

function pointerDown(event) {
  const canvas = $('canvas-main'); if (!canvas || !state.imgW) return;
  canvas.setPointerCapture?.(event.pointerId); const transient = state.transient; transient.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (transient.activePointers.size === 2) { const points = [...transient.activePointers.values()]; transient.lastPinchDist = distance(points); transient.lastMidpoint = midpoint(points); return; }
  const point = canvasToImagePosition(event, canvas, state.imgW, state.imgH, state.view, state.imageRotation); transient.dragStart = point; transient.mStart = { x: event.clientX, y: event.clientY }; const scale = canvas.width / state.imgW;
  if (state.activeTool === 'select' || state.activeTool === 'pan') {
    const mark = state.spottingMarks.find(item => Math.hypot(point.x - item.x, point.y - item.y) < 12);
    const line = state.lines.find(item => { const positioned = imageCanvasPosition(item.cx, item.cy, state.imgW, state.imgH, scale, scale, state.imageRotation); return Math.abs(point.cy - positioned.cy) < 20 && Math.abs(point.cx - positioned.cx) < item.w * scale / 2; });
    const lane = state.lanes.find(item => { const positioned = imageCanvasPosition(item.cx, item.cy, state.imgW, state.imgH, scale, scale, state.imageRotation); return Math.abs(point.cx - positioned.cx) < item.w * scale / 2 && Math.abs(point.cy - positioned.cy) < item.h * scale / 2; });
    if (mark) { saveUndoSnapshot(); state.activeMark = mark; state.activeLine = null; state.activeLane = null; transient.editingField = 'move-mark'; }
    else if (line) { saveUndoSnapshot(); state.activeLine = line; state.activeMark = null; state.activeLane = null; transient.editingField = 'move-line'; }
    else if (lane) { saveUndoSnapshot(); state.activeLane = lane; state.activeLine = null; state.activeMark = null; transient.editingField = state.activeTool === 'select' ? 'select-lane' : 'move-lane'; renderProfiles(); renderTable(); }
    else { state.activeMark = null; state.activeLine = null; state.activeLane = null; if (state.activeTool === 'pan') transient.isPanning = true; transient.viewStart = { ...state.view }; }
  } else if (state.activeTool === 'roi') {
    transient.roiRect = { x: point.x, y: point.y, w: 1, h: 1 };
  } else if (state.activeTool === 'line') {
    saveUndoSnapshot(); const line = { cx: point.x, cy: point.y, w: 1, angle: 0 }; state.lines.push(line); state.activeLine = line; transient.editingField = 'resize-line';
  } else if (state.activeTool === 'spotting') {
    saveUndoSnapshot(); const originLines = state.lines.filter(line => imageCanvasPosition(line.cx, line.cy, state.imgW, state.imgH, scale, scale, state.imageRotation).cy > state.imgH * scale / 2);
    let y = point.y;
    if (originLines.length) { const origin = originLines.reduce((best, item) => Math.hypot(point.x - item.cx, point.y - item.cy) < Math.hypot(point.x - best.cx, point.y - best.cy) ? item : best); if (Math.abs(point.y - origin.cy) < 50) y = origin.cy; }
    state.spottingMarks.push({ x: point.x, y }); persistProject();
  } else if (state.activeTool === 'rotate_img') { saveUndoSnapshot(); transient.isRotating = true; transient.rotateStart = state.imageRotation; }
  render();
}

function pointerMove(event) {
  const transient = state.transient; if (!transient.activePointers.has(event.pointerId)) return;
  transient.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (transient.activePointers.size === 2) {
    const points = [...transient.activePointers.values()]; const newDistance = distance(points); const newMidpoint = midpoint(points); const oldZoom = state.view.zoom;
    if (transient.lastPinchDist > 0) state.view.zoom = Math.min(20, Math.max(.1, state.view.zoom * newDistance / transient.lastPinchDist));
    state.view.dx += (newMidpoint.x - transient.lastMidpoint.x) - (newMidpoint.x - state.view.dx) * (state.view.zoom / oldZoom - 1);
    state.view.dy += (newMidpoint.y - transient.lastMidpoint.y) - (newMidpoint.y - state.view.dy) * (state.view.zoom / oldZoom - 1);
    transient.lastPinchDist = newDistance; transient.lastMidpoint = newMidpoint; render(); return;
  }
  if (!transient.dragStart) return;
  const canvas = $('canvas-main'); const point = canvasToImagePosition(event, canvas, state.imgW, state.imgH, state.view, state.imageRotation);
  if (transient.isPanning) { state.view.dx = transient.viewStart.dx + event.clientX - transient.mStart.x; state.view.dy = transient.viewStart.dy + event.clientY - transient.mStart.y; }
  else if (transient.isRotating) state.imageRotation = transient.rotateStart + (event.clientX - transient.mStart.x) * .002;
  else if (transient.editingField === 'move-mark') { state.activeMark.x = point.x; state.activeMark.y = point.y; }
  else if (transient.editingField === 'move-line') { state.activeLine.cx = point.x; state.activeLine.cy = point.y; }
  else if (transient.editingField === 'move-lane') { state.activeLane.cx = point.x; state.activeLane.cy = point.y; }
  else if (transient.editingField === 'select-lane' && (Math.abs(event.clientX - transient.mStart.x) > 10 || Math.abs(event.clientY - transient.mStart.y) > 10)) { transient.editingField = 'move-lane'; state.activeLane.cx = point.x; state.activeLane.cy = point.y; }
  else if (transient.editingField === 'resize-line') { const scale = canvas.width / state.imgW; state.activeLine.w = Math.abs(point.cx - imageCanvasPosition(state.activeLine.cx, state.activeLine.cy, state.imgW, state.imgH, scale, scale, state.imageRotation).cx) * 2 / scale; }
  else if (transient.roiRect && state.activeTool === 'roi') { transient.roiRect.w = point.x - transient.roiRect.x; transient.roiRect.h = point.y - transient.roiRect.y; }
  render();
}

function pointerUp(event) {
  const transient = state.transient; transient.activePointers.delete(event.pointerId); if (transient.activePointers.size < 2) { transient.lastPinchDist = 0; transient.lastMidpoint = null; }
  if (state.activeTool === 'roi' && transient.roiRect && Math.abs(transient.roiRect.w) > 5 && Math.abs(transient.roiRect.h) > 5) applyCrop();
  if (transient.editingField) persistProject(); transient.dragStart = null; transient.isPanning = false; transient.isRotating = false; transient.editingField = null;
}

function doubleClick() { if (state.activeTool === 'rotate_img') { saveUndoSnapshot(); state.imageRotation += Math.PI / 2; render(); persistProject(); } }
function wheel(event) { event.preventDefault(); const point = canvasToImagePosition(event, $('canvas-main'), state.imgW, state.imgH, state.view, state.imageRotation); const multiplier = event.deltaY > 0 ? .9 : 1.1; const oldZoom = state.view.zoom; state.view.zoom = Math.min(20, Math.max(.1, state.view.zoom * multiplier)); state.view.dx -= (point.scX - state.view.dx) * (state.view.zoom / oldZoom - 1); state.view.dy -= (point.scY - state.view.dy) * (state.view.zoom / oldZoom - 1); render(); }
