import assert from 'node:assert/strict';
import test from 'node:test';

import { applyImageFilters } from '../../frontend/modules/image_filters.js';

test('mobile RGB projections visibly change image pixels', () => {
  const source = new Uint8ClampedArray([200, 100, 50, 255]);
  const green = applyImageFilters(source.slice(), 540, false);
  const red = applyImageFilters(source.slice(), 650, false);
  assert.notDeepEqual([...green], [...source]);
  assert.notDeepEqual([...red], [...source]);
  assert.notDeepEqual([...green], [...red]);
});

test('inversion composes with the selected RGB projection', () => {
  const projected = applyImageFilters(new Uint8ClampedArray([200, 100, 50, 255]), 540, false);
  const inverted = applyImageFilters(new Uint8ClampedArray([200, 100, 50, 255]), 540, true);
  assert.equal(inverted[0], 255 - projected[0]);
  assert.equal(inverted[1], 255 - projected[1]);
  assert.equal(inverted[2], 255 - projected[2]);
  assert.equal(inverted[3], 255);
});
