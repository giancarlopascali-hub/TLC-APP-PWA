import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculateRf,
  findPeakBounds,
  integratePeakArea,
  migrateLaneSchema,
  remeasurePeak,
} from '../../frontend/modules/analysis.js';
import { buildAreaCalibration, buildMwCalibration, relativeQuantitation } from '../../frontend/modules/calibration.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/numerical_cases.json', import.meta.url), 'utf8'));

test('canonical area fixtures agree with the Python contract', () => {
  fixture.area_cases.forEach(({ name, signal, left, right, expected }) => {
    assert.equal(integratePeakArea(signal, left, right), expected, name);
  });
});

test('non-finite analysis samples are rejected instead of silently reported as zero area', () => {
  assert.throws(() => integratePeakArea([0, Number.NaN, 0], 0, 2), /non-finite/i);
});

test('Rf fixtures retain the 5%-padded lane-box convention', () => {
  fixture.rf_cases.forEach(({ name, index, length, expected }) => {
    assert.ok(Math.abs(calculateRf(index, length) - expected) < 1e-12, name);
  });
});

test('manual peak lifecycle uses the analysis signal and authoritative area bounds', () => {
  const lane = {
    profile_display: [0, 3, 10, 3, 0],
    profile_analysis: [0, 30, 100, 30, 0],
  };
  const initial = remeasurePeak({ idx: 2, manual: true, type: 'N' }, lane, 50, { resetBounds: true });
  assert.deepEqual([initial.area_lb, initial.area_rb], [initial.display_lb, initial.display_rb]);
  assert.equal(initial.area, integratePeakArea(lane.profile_analysis, initial.area_lb, initial.area_rb));
  const resized = remeasurePeak({ ...initial, area_lb: 1, area_rb: 3 }, lane, 50);
  assert.equal(resized.area, 70);
  const moved = remeasurePeak({ ...resized, idx: 1 }, lane, 50, { resetBounds: true });
  assert.equal(moved.height_display, 3);
  assert.equal(moved.height_analysis, 30);
  assert.notEqual(moved.rf, initial.rf);
});

test('legacy profile and peak fields migrate to origin-to-front schema', () => {
  const migrated = migrateLaneSchema({
    id: '1.1', profile: [2, 4, 10], peaks: [{ idx: 1, lb: 0, rb: 2, height: 4, area: 10 }],
  });
  assert.deepEqual(migrated.profile_display, [10, 4, 2]);
  assert.deepEqual(migrated.profile_analysis, [100, 25, 0]);
  assert.equal(migrated.peaks[0].area_lb, 0);
  assert.equal(migrated.peaks[0].display_rb, 2);
  assert.equal(migrated.peaks[0].area, 75);
});

test('bounds remain inclusive, ordered, and usable for a narrow manual peak', () => {
  const bounds = findPeakBounds([0, 0, 100, 0, 0], 2, 50);
  assert.ok(bounds.area_rb > bounds.area_lb);
  assert.deepEqual([bounds.area_lb, bounds.area_rb], [bounds.display_lb, bounds.display_rb]);
});

test('Width percentage changes the one authoritative integration interval', () => {
  const profile = [0, 5, 25, 100, 25, 5, 0];
  const wide = findPeakBounds(profile, 3, 20);
  const narrow = findPeakBounds(profile, 3, 60);
  assert.deepEqual([wide.area_lb, wide.area_rb], [1, 5]);
  assert.deepEqual([narrow.area_lb, narrow.area_rb], [2, 4]);
  assert.ok(integratePeakArea(profile, narrow.area_lb, narrow.area_rb) < integratePeakArea(profile, wide.area_lb, wide.area_rb));
});

test('calibration failures are explicit and relative totals cannot become NaN', () => {
  assert.match(buildAreaCalibration([{ peaks: [{ type: 'S', area: 0, calibrationValue: 3 }] }]).error, /non-zero/i);
  assert.match(buildAreaCalibration([{ peaks: [{ type: 'S', area: 2, calibrationValue: 3 }, { type: 'S', area: 2, calibrationValue: 4 }] }]).error, /distinct/i);
  assert.match(buildMwCalibration([{ peaks: [{ type: 'S', rf: .5, mwValue: 20 }, { type: 'S', rf: .5, mwValue: 10 }] }]).error, /distinct/i);
  const relative = relativeQuantitation([{ area: 0 }, { area: 0 }]);
  assert.deepEqual(relative.map(item => item.relativePercent), [0, 0]);
  assert.deepEqual(relative.map(item => item.correctedPercent), [0, 0]);
});
