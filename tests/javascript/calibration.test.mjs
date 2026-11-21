import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areaCalibrationQualifier, areaCalibrationSummary, buildAreaCalibration,
} from '../../frontend/modules/calibration.js';
import { reportRows } from '../../frontend/modules/reports.js';
import { state } from '../../frontend/modules/state.js';

const standard = (area, calibrationValue) => ({ type: 'S', area, calibrationValue });
const lanes = (...peaks) => [{ peaks }];

test('replicate areas form one mean level and one level stays proportional through zero', () => {
  const model = buildAreaCalibration(lanes(standard(8, 10), standard(12, '10')));
  assert.deepEqual(model.levels, [{ value: 10, area: 10, replicates: 2 }]);
  assert.equal(model.evaluate(0), 0);
  assert.equal(model.evaluate(5), 5);
  assert.equal(model.evaluate(20), 20);
  assert.match(areaCalibrationSummary(model), /replicate areas at the same amount are averaged/);
  assert.match(areaCalibrationQualifier(model, 20, 20), /Proportional estimate outside/);
});

test('two measured levels use a zero-anchored quadratic within range and a line above it', () => {
  const model = buildAreaCalibration(lanes(
    standard(8, 10), standard(12, 10), standard(28, 20), standard(32, 20),
  ));
  assert.deepEqual(model.levels.map(level => [level.value, level.area, level.replicates]),
    [[10, 10, 2], [20, 30, 2]]);
  assert.ok(Math.abs(model.evaluate(5) - 5.416666666666667) < 1e-12);
  assert.ok(Math.abs(model.evaluate(20) - 16.666666666666668) < 1e-12);
  assert.equal(model.evaluate(40), 25);
  assert.match(areaCalibrationQualifier(model, 40, 25), /Linear extrapolation outside standards/);
  assert.match(areaCalibrationQualifier(model, 5, model.evaluate(5)), /Interpolation from assumed zero point/);
});

test('three or more levels preserve local interior interpolation and upper last-pair extension', () => {
  const model = buildAreaCalibration(lanes(
    standard(1, 1), standard(2, 4), standard(3, 9), standard(4, 16),
  ));
  assert.equal(model.evaluate(0.5), 0.25);
  assert.equal(model.evaluate(2.5), 6.25);
  assert.equal(model.evaluate(3.5), 12.25);
  assert.equal(model.evaluate(5), 23);
  assert.deepEqual(model.levels.map(level => model.evaluate(level.area)), [1, 4, 9, 16]);
});

test('backward-bending quadratic falls back to its bracket line', () => {
  const origin = buildAreaCalibration(lanes(standard(1, 1), standard(2, 20)));
  assert.equal(origin.evaluate(0.5), 0.5);
  assert.equal(origin.evaluate(1.5), 8.25);
  const interior = buildAreaCalibration(lanes(standard(1, 1), standard(2, 2), standard(3, 20)));
  assert.equal(interior.evaluate(1.5), 1.5);
  assert.equal(interior.evaluate(2.5), 8.875);
});

test('invalid, missing, and contradictory standards are handled explicitly', () => {
  for (const plate of [lanes(standard(10, 1), standard(10, 2)),
    lanes(standard(20, 1), standard(10, 2))]) {
    const model = buildAreaCalibration(plate);
    assert.equal(model.evaluate, null);
    assert.match(areaCalibrationSummary(model), /Calibration unavailable: Mean standard areas must increase/);
  }
  const conflict = buildAreaCalibration(lanes(standard(10, 0), standard(12, 5)));
  assert.match(conflict.error, /zero-amount S standard has positive area/);
  assert.equal(conflict.evaluate, null);
  const redundantZero = buildAreaCalibration(lanes(standard(0, 0), standard(12, 5)));
  assert.deepEqual(redundantZero.levels, [{ value: 5, area: 12, replicates: 1 }]);
  assert.equal(redundantZero.skippedCount, 0);
  const blank = buildAreaCalibration(lanes(standard(10, null), standard(11, ''), standard(12, 5)));
  assert.equal(blank.skippedCount, 2);
  assert.equal(blank.evaluate(24), 10);
  assert.equal(blank.evaluate(Number.NaN), null);
  assert.equal(blank.evaluate(-1), null);
  assert.match(buildAreaCalibration(lanes(standard(1e-10, 5), standard(12, 10))).error,
    /too close to the assumed zero-area origin/);
});

test('mobile report shows the shared model note, qualifiers, and unavailable result', () => {
  state.integrationMethod = 'calibration';
  const known = standard(10, 10);
  const second = standard(30, 20);
  const unknown = { type: 'A', area: 40, rf: 0.5, name: 'Unknown' };
  state.lanes = lanes(known, second, unknown);
  const report = reportRows(state.lanes[0]);
  assert.match(report, /Zero area is assumed to mean zero amount/);
  assert.match(report, /Linear extrapolation outside standards; use caution/);
  assert.match(report, /<td>25\.00<small/);
  state.lanes = lanes(standard(10, 0), second, unknown);
  const invalid = reportRows(state.lanes[0]);
  assert.match(invalid, /Calibration unavailable: A zero-amount S standard has positive area/);
  assert.match(invalid, /<td>—<\/td>/);
});
