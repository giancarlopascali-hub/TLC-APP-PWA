import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopCompatibleLanes } from '../../frontend/modules/lane_geometry.js';

test('lane boxes use the desktop default width rather than the drawn boundary width', () => {
  const { pairs, lanes } = buildDesktopCompatibleLanes({
    imageWidth: 140,
    imageHeight: 260,
    canvasWidth: 280,
    lines: [
      { cx: 70, cy: 210, w: 120 },
      { cx: 70, cy: 50, w: 120 },
    ],
    spottingMarks: [{ x: 35, y: 210 }, { x: 105, y: 210 }],
  });

  assert.equal(pairs.length, 1);
  assert.deepEqual(lanes.map(lane => ({ id: lane.id, cx: lane.cx, cy: lane.cy, w: lane.w, h: lane.h })), [
    { id: '1.1', cx: 35, cy: 130, w: 35, h: 176 },
    { id: '1.2', cx: 105, cy: 130, w: 35, h: 176 },
  ]);
});

test('closely spaced marks narrow all sibling lanes with the desktop 85% rule', () => {
  const { lanes } = buildDesktopCompatibleLanes({
    imageWidth: 140,
    imageHeight: 260,
    canvasWidth: 140,
    lines: [
      { cx: 70, cy: 210, w: 20 },
      { cx: 70, cy: 50, w: 20 },
    ],
    spottingMarks: [{ x: 35, y: 210 }, { x: 65, y: 210 }, { x: 105, y: 210 }],
  });

  assert.equal(lanes.length, 3);
  assert.ok(lanes.every(lane => lane.w === 25.5));
});

test('unpairable boundary lines never produce a profile lane', () => {
  const { pairs, lanes } = buildDesktopCompatibleLanes({
    imageWidth: 140,
    imageHeight: 260,
    canvasWidth: 140,
    lines: [{ cx: 70, cy: 110, w: 100 }, { cx: 70, cy: 145, w: 100 }],
    spottingMarks: [{ x: 70, y: 145 }],
  });

  assert.equal(pairs.length, 0);
  assert.deepEqual(lanes, []);
});
