/** Pure coordinate helpers for image/canvas and touch geometry. */

export function imageCanvasPosition(x, y, imageWidth, imageHeight, scaleX, scaleY, rotation) {
  const centerX = imageWidth * scaleX / 2;
  const centerY = imageHeight * scaleY / 2;
  const dx = x * scaleX - centerX;
  const dy = y * scaleY - centerY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { cx: dx * cos - dy * sin + centerX, cy: dx * sin + dy * cos + centerY };
}

export function canvasToImagePosition(event, canvas, imageWidth, imageHeight, view, rotation) {
  const rect = canvas.getBoundingClientRect();
  const scX = (event.clientX - rect.left) * (canvas.width / rect.width);
  const scY = (event.clientY - rect.top) * (canvas.height / rect.height);
  const zoom = view.zoom;
  const x = (scX - view.dx) / zoom;
  const y = (scY - view.dy) / zoom;
  const scale = canvas.width / imageWidth;
  const centerX = imageWidth * scale / 2;
  const centerY = imageHeight * scale / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    x: (dx * cos - dy * sin + centerX) / scale,
    y: (dx * sin + dy * cos + centerY) / scale,
    scX,
    scY,
    cx: x,
    cy: y,
  };
}

export function distance(points) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function midpoint(points) {
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

export function normaliseRect(rect) {
  const x2 = rect.x + rect.w;
  const y2 = rect.y + rect.h;
  return { x: Math.min(rect.x, x2), y: Math.min(rect.y, y2), w: Math.abs(rect.w), h: Math.abs(rect.h) };
}
