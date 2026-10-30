import assert from 'node:assert/strict';
import test from 'node:test';

import { applyImageFilters, wavelengthToRgb, wavelengthWindowToRgb } from '../../frontend/modules/image_filters.js';

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

test('window zero preserves the selected RGB weighting and a wider window changes it', () => {
  assert.deepEqual(wavelengthWindowToRgb(450, 0), wavelengthToRgb(450));
  const source = new Uint8ClampedArray([255, 0, 0, 255]);
  const single = applyImageFilters(source.slice(), 450, false, 0);
  const wider = applyImageFilters(source.slice(), 450, false, 50);
  assert.deepEqual([...single], [0, 0, 0, 255]);
  assert.ok(wider[0] > 0, 'the wider window includes wavelengths with red weight');
  assert.notDeepEqual([...wider], [...single]);
  assert.deepEqual([...applyImageFilters(source.slice(), null, false, 50)], [...source]);
});

test('the RGB window clips at visible endpoints and rounds half up', () => {
  const clipped = wavelengthWindowToRgb(380, 50);
  assert.equal(clipped.g, 0);
  assert.ok(clipped.r > 0 && clipped.b > 0);
  assert.deepEqual(wavelengthWindowToRgb(540.5, 2.5), wavelengthWindowToRgb(541, 3));
  assert.throws(() => wavelengthWindowToRgb(540, 51), RangeError);
});
