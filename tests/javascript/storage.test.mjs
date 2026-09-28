import assert from 'node:assert/strict';
import test from 'node:test';

const memory = new Map();
globalThis.document = { getElementById: () => null };
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};

const { state } = await import('../../frontend/modules/state.js');
const {
  migrateProject,
  persistProject,
  snapshotProject,
} = await import('../../frontend/modules/storage.js');

function resetState() {
  state.imgB64 = 'data:image/jpeg;base64,AA==';
  state.originalB64 = state.imgB64;
  state.imgW = 20;
  state.imgH = 10;
  state.imageRotation = 0;
  state.lines = [];
  state.spottingMarks = [];
  state.lanes = [];
  state.activeLane = null;
  state.integrationMethod = 'relative';
  state.polarityMode = 'default';
  state.peakProminence = 40;
  state.peakDistance = 8;
  state.peakThreshold = 50;
  state.targetWavelength = null;
  state.wavelengthPreset = 'full';
  state.invertColors = false;
}

test('legacy local projects receive the versioned origin-to-front schema', () => {
  const migrated = migrateProject({
    img: 'data:image/jpeg;base64,AA==',
    w: 20,
    h: 10,
    lanes: [{ id: '1', profile: [1, 2, 3], peaks: [{ idx: 1, lb: 0, rb: 2, manual: false }] }],
  });
  const lane = migrated.annotations.lanes[0];
  assert.equal(migrated.schema_version, 2);
  assert.deepEqual(lane.profile_display, [3, 2, 1]);
  assert.deepEqual(lane.profile_analysis, [100, 50, 0]);
  assert.equal(lane.peaks[0].area_recalculation_required, true);
  assert.equal(lane.peaks[0].area_lb, 0);
  assert.equal(lane.peaks[0].area_rb, 2);
});

test('temporary workspace snapshots retain the versioned project shape', () => {
  resetState();
  const exported = JSON.parse(snapshotProject());
  assert.equal(exported.schema_version, 2);
  assert.equal(exported.image.current, state.imgB64);
});

test('storage quota failures remain explicit and do not throw through the UI', () => {
  resetState();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    setItem: () => {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };
  assert.deepEqual(persistProject(), {
    ok: false,
    error: 'Storage is full. Start a new analysis before continuing.',
  });
  globalThis.localStorage = originalStorage;
});
