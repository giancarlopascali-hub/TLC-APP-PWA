import { displayProfileFor } from './analysis.js';
import { imageCanvasPosition } from './coords.js';
import { applyImageFilters } from './image_filters.js';
import { $, state } from './state.js';

let filteredSource = null;
let filteredImage = null;
let filteredSettings = null;

function imageSource() {
  if (!state.imgEl || (!state.targetWavelength && !state.invertColors)) return state.imgEl;
  const settings = `${state.targetWavelength ?? 'full'}:${state.invertColors}`;
  if (filteredSource === state.imgEl && filteredSettings === settings && filteredImage) return filteredImage;
  const canvas = document.createElement('canvas');
  canvas.width = state.imgEl.naturalWidth || state.imgW;
  canvas.height = state.imgEl.naturalHeight || state.imgH;
  const context = canvas.getContext('2d');
  context.drawImage(state.imgEl, 0, 0, canvas.width, canvas.height);
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    applyImageFilters(pixels.data, state.targetWavelength, state.invertColors);
    context.putImageData(pixels, 0, 0);
    filteredSource = state.imgEl;
    filteredSettings = settings;
    filteredImage = canvas;
    return filteredImage;
  } catch (error) {
    console.warn('[AQ-TLC] Image filtering fallback:', error);
    return state.imgEl;
  }
}

export function render() {
  const canvas = $('canvas-main');
  if (!canvas || !state.imgEl) return;
  const container = canvas.parentElement;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  $('lane-count-badge')?.replaceChildren(document.createTextNode(`${state.lanes.length} Lanes`));
  context.save();
  context.translate(state.view.dx, state.view.dy); context.scale(state.view.zoom, state.view.zoom);
  const scale = width / state.imgW;
  const drawHeight = state.imgH * scale;
  context.save();
  context.translate(state.imgW * scale / 2, state.imgH * scale / 2);
  context.rotate(state.imageRotation);
  context.drawImage(imageSource(), -state.imgW * scale / 2, -state.imgH * scale / 2, width, drawHeight);
  context.translate(-state.imgW * scale / 2, -state.imgH * scale / 2);
  drawMarks(context, scale);
  drawLines(context, scale);
  drawLanes(context, scale);
  drawCrop(context, scale);
  context.restore();
  context.restore();
}

function drawMarks(context, scale) {
  state.spottingMarks.forEach(mark => {
    context.fillStyle = state.activeMark === mark ? '#ffc107' : '#58a6ff';
    context.beginPath(); context.arc(mark.x * scale, mark.y * scale, 6 / state.view.zoom, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#fff'; context.lineWidth = 1 / state.view.zoom; context.stroke();
  });
}

function drawLines(context, scale) {
  state.lines.forEach(line => {
    const positioned = imageCanvasPosition(line.cx, line.cy, state.imgW, state.imgH, scale, scale, state.imageRotation);
    const isOrigin = positioned.cy > state.imgH * scale / 2;
    context.save(); context.translate(line.cx * scale, line.cy * scale); context.rotate((line.angle || 0) - state.imageRotation);
    context.strokeStyle = state.activeLine === line ? '#ffc107' : (isOrigin ? '#f0883e' : '#238636');
    context.lineWidth = 4 / state.view.zoom; context.beginPath(); context.moveTo(-line.w * scale / 2, 0); context.lineTo(line.w * scale / 2, 0); context.stroke();
    context.fillStyle = context.strokeStyle; context.font = `bold ${12 / state.view.zoom}px sans-serif`;
    context.fillText(isOrigin ? 'ORIGIN' : 'FRONT', -line.w * scale / 2, -8 / state.view.zoom); context.restore();
  });
}

function drawLanes(context, scale) {
  state.lanes.forEach(lane => {
    context.save(); context.translate(lane.cx * scale, lane.cy * scale); context.rotate(lane.angle || 0);
    const active = state.activeLane === lane;
    context.strokeStyle = active ? '#ffc107' : 'rgba(88,166,255,.45)'; context.lineWidth = active ? 4 / state.view.zoom : 2 / state.view.zoom;
    context.strokeRect(-lane.w * scale / 2, -lane.h * scale / 2, lane.w * scale, lane.h * scale);
    const n = displayProfileFor(lane).length;
    if (n > 1) (lane.peaks || []).forEach(peak => {
      const lb = Number(peak.display_lb ?? peak.area_lb ?? peak.lb ?? 0);
      const rb = Number(peak.display_rb ?? peak.area_rb ?? peak.rb ?? 0);
      const top = (0.5 - rb / (n - 1)) * lane.h * scale;
      const bottom = (0.5 - lb / (n - 1)) * lane.h * scale;
      const rgb = peak.manual ? '227,76,38' : '255,215,0';
      context.fillStyle = active ? `rgba(${rgb},.25)` : `rgba(${rgb},.12)`;
      context.fillRect(-lane.w * scale / 2, top, lane.w * scale, bottom - top);
    });
    context.restore();
  });
}

function drawCrop(context, scale) {
  const rectangle = state.transient.roiRect;
  if (!rectangle) return;
  context.strokeStyle = '#f0883e'; context.lineWidth = 2 / state.view.zoom; context.setLineDash([5 / state.view.zoom, 5 / state.view.zoom]);
  context.strokeRect(rectangle.x * scale, rectangle.y * scale, rectangle.w * scale, rectangle.h * scale);
  context.fillStyle = 'rgba(240,136,62,.1)'; context.fillRect(rectangle.x * scale, rectangle.y * scale, rectangle.w * scale, rectangle.h * scale);
  context.setLineDash([]);
}
