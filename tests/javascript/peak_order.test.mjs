import assert from 'node:assert/strict';
import test from 'node:test';
import { orderPeakRows, relativeQuantitation } from '../../frontend/modules/calibration.js';

test('Streamlit table orders manual peaks by Rf and preserves edit targets', () => {
  const peaks = [
    { name: 'low', rf: 0.18, area: 12 },
    { name: 'high', rf: 0.79, area: 24 },
    { name: 'manual', rf: 0.43, area: 8, manual: true },
  ];
  const rows = orderPeakRows(relativeQuantitation(peaks));
  assert.deepEqual(rows.map(({ peak }) => peak.name), ['low', 'manual', 'high']);
  assert.deepEqual(rows.map(({ sourceIndex }) => sourceIndex), [0, 2, 1]);
  peaks[rows[1].sourceIndex].name = 'edited manual';
  assert.equal(peaks[2].name, 'edited manual');
  assert.equal(peaks[1].name, 'high');
});
