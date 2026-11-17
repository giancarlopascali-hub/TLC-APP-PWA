import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateLaneSchema, remeasurePeak } from '../../frontend/modules/analysis.js';
import { exportReport, reportFitSummary, reportRows } from '../../frontend/modules/reports.js';
import { applyFitDecision, fitCurveSeries, fitIntegrationSegments,
  invalidateKeptFitGroup, tagKeptFitPeaks } from '../../frontend/modules/shoulder.js';
import { state } from '../../frontend/modules/state.js';
import { migrateProject } from '../../frontend/modules/storage.js';

const ordinary = { idx: 3, rf: 0.3, area: 20, area_lb: 2, area_rb: 5, type: 'N' };
const fitted = [
  { idx: 3, rf: 0.3, area: 13, area_method: 'deconvolved', fit_group_id: 'lane:3', fit_component_index: 0, area_lb: 2, area_rb: 4, type: 'N' },
  { idx: 6, rf: 0.6, area: 7, area_method: 'deconvolved', fit_group_id: 'lane:3', fit_component_index: 1, area_lb: 6, area_rb: 8, type: 'N' },
];
const group = {
  id: 'lane:3', status: 'resolved', reason: 'accepted', decision: 'split', active: true,
  original_peak: { ...ordinary }, split_peaks: fitted.map(peak => ({ ...peak })),
  bounds: { lb: 2, rb: 8 }, integration_bounds: { lb: 2, rb: 8 },
  integration_segments: [{ lb: 2, rb: 4, area: 12 }, { lb: 6, rb: 8, area: 8 }],
  measured_cluster_area: 20, width_threshold: 50,
  baseline_curve: [0, 0, 0, 0, 0, 0, 0], double_curve: [1, 5, 10, 3, 2, 7, 1],
  components: [
    { peak_index: 0, center_idx: 3, rf: 0.3, area: 13, fit_area: 14, curve: [0, 4, 8, 2, 0, 0, 0] },
    { peak_index: 1, center_idx: 6, rf: 0.6, area: 7, fit_area: 8, curve: [0, 0, 1, 1, 2, 6, 1] },
  ],
  quality: { improvement: 0.4 },
};

test('fitted areas survive schema migration and detach on manual remeasurement', () => {
  const lane = migrateLaneSchema({
    id: 'lane', profile_display: [0, 3, 8, 10, 6, 3, 8, 5, 0],
    profile_analysis: [0, 30, 80, 100, 60, 30, 80, 50, 0],
    peaks: fitted, fit_groups: [group],
  }, 50);
  assert.deepEqual(lane.peaks.map(peak => peak.area), [13, 7]);
  assert.equal(lane.fit_groups[0].measured_cluster_area, 20);
  const manual = remeasurePeak(lane.peaks[0], lane, 50, { resetBounds: true });
  assert.equal(manual.area_method, undefined);
  assert.notEqual(manual.area, 13);
});

test('Split and Keep swap one cluster while retaining unrelated peak edits', () => {
  const extra = { idx: 9, rf: 0.9, area: 11, name: 'Unrelated', type: 'S', calibrationValue: 4 };
  const lane = { peaks: [...fitted.map(peak => ({ ...peak })), extra], fit_groups: [structuredClone(group)] };
  assert.equal(applyFitDecision(lane, 'lane:3', 'keep'), true);
  assert.deepEqual(lane.peaks.filter(peak => peak.name === 'Unrelated'), [extra]);
  assert.equal(lane.peaks.find(peak => peak.idx === 3)?.area, 20);
  assert.deepEqual(lane.fit_groups[0].components.map(component => component.peak_index), [null, null]);
  tagKeptFitPeaks(lane);
  assert.equal(applyFitDecision(lane, 'lane:3', 'split'), true);
  assert.deepEqual(lane.peaks.filter(peak => peak.fit_group_id === 'lane:3').map(peak => peak.area), [13, 7]);
  assert.deepEqual(lane.fit_groups[0].components.map(component => component.peak_index), [0, 1]);
  assert.deepEqual(lane.peaks.filter(peak => peak.name === 'Unrelated'), [extra]);
});

test('editing a kept peak invalidates its previous candidate', () => {
  const lane = { peaks: [{ ...ordinary, fit_candidate_group_id: 'lane:3' }], fit_groups: [structuredClone(group)] };
  const overrides = { 'lane:3': 'keep' };
  assert.equal(invalidateKeptFitGroup(lane, lane.peaks[0], overrides), true);
  assert.deepEqual(lane.fit_groups, []);
  assert.deepEqual(overrides, {});
});

test('measured segments remain disjoint and fit curves align to inclusive bounds', () => {
  assert.deepEqual(fitIntegrationSegments(group), group.integration_segments);
  const series = fitCurveSeries(group, 9);
  assert.equal(series.lb, 2); assert.equal(series.rb, 8);
  assert.equal(series.total.length, 7);
  assert.equal(series.components.length, 2);
});

test('report labels model allocation and the active decision', () => {
  state.integrationMethod = 'relative';
  state.lanes = [{ id: 'lane', peaks: fitted }];
  const lane = { id: 'lane', peaks: fitted, fit_groups: [group] };
  const summary = reportFitSummary(lane);
  const rows = reportRows(lane);
  assert.match(summary, /Split into two fitted components/);
  assert.match(summary, /20\.0 AU/);
  assert.match(rows, /Model allocated/);
  assert.match(rows, />13\.0</);
  assert.match(rows, />7\.0</);
  state.integrationMethod = 'mw_calibration';
  const mwRows = reportRows(lane);
  assert.match(mwRows, /Area \(AU\)/);
  assert.match(mwRows, />13\.0</);
  const unsafe = structuredClone(group);
  unsafe.status = 'unresolved'; unsafe.active = false; unsafe.reason = '<img src=x onerror=alert(1)>';
  const escaped = reportFitSummary({ ...lane, fit_groups: [unsafe] });
  assert.doesNotMatch(escaped, /<img src=x/);
  assert.match(escaped, /&lt;img/);
});

test('saved project restores sensitivity and per-group decision', () => {
  const project = migrateProject({
    schema_version: 2,
    image: {}, annotations: { lanes: [] },
    analysis: { shoulder_sensitivity: 80, fit_overrides: { 'lane:3': 'keep' } },
  });
  assert.equal(project.analysis.shoulder_sensitivity, 80);
  assert.deepEqual(project.analysis.fit_overrides, { 'lane:3': 'keep' });
});

test('pending analysis blocks report export before opening a window', async () => {
  state.isProfilePending = true; state.isProfileStale = true;
  await assert.rejects(exportReport('lane'), /Wait for the current analysis/);
  state.isProfilePending = false; state.isProfileStale = false;
});
