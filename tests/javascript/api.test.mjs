import assert from 'node:assert/strict';
import test from 'node:test';

const listeners = new Map();
const outbound = [];
const sessionStorageValues = new Map();
const streamlitParent = {
  postMessage(message, targetOrigin) { outbound.push({ message, targetOrigin }); },
};
globalThis.window = {
  parent: streamlitParent,
  addEventListener(type, listener) { listeners.set(type, listener); },
  sessionStorage: {
    getItem(key) { return sessionStorageValues.get(key) ?? null; },
    setItem(key, value) { sessionStorageValues.set(key, String(value)); },
    removeItem(key) { sessionStorageValues.delete(key); },
  },
};

const { clearPendingRequests, hasPendingRequests, registerApiHandlers, requestCrop, requestProfiles } = await import('../../frontend/modules/api.js');

function sentRequests() {
  return outbound.filter(item => item.message.type === 'streamlit:setComponentValue').map(item => item.message.value);
}

function deliver(response) {
  listeners.get('message')({
    source: streamlitParent,
    // Streamlit's replies do not include the marker used for component-to-host
    // messages.  Keeping this fixture faithful prevents a silent response
    // handling regression.
    data: { type: 'streamlit:render', args: { response } },
  });
}

async function until(predicate) {
  for (let index = 0; index < 60; index += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for asynchronous request');
}

function profileResponse(request, id) {
  return {
    protocol_version: 1,
    action: 'generate_profiles_result',
    request_id: request.request_id,
    ok: true,
    data: {
      results: [{ id, profile_display: [0, 5, 0], profile_analysis: [0, 100, 0], peaks: [] }],
      _detectPeaks: true,
    },
    error: null,
  };
}

test('a stale Streamlit profile response cannot overwrite a newer profile request', () => {
  const received = [];
  registerApiHandlers({ profiles: result => received.push(result), error: error => { throw new Error(error); }, activity: () => {} });
  const start = sentRequests().length;
  const firstId = requestProfiles({ image: 'first', peak_threshold: 25 }, { coalesce: false });
  const secondId = requestProfiles({ image: 'second', peak_threshold: 50 }, { coalesce: false });
  const [first, second] = sentRequests().slice(start);
  assert.equal(first.request_id, firstId);
  assert.equal(second.request_id, secondId);
  deliver(profileResponse(second, 'new'));
  deliver(profileResponse(first, 'old'));
  assert.equal(received.length, 1);
  assert.equal(received[0].results[0].id, 'new');
  assert.deepEqual(received[0].results[0].profile_display, [0, 5, 0]);
  assert.deepEqual(received[0].results[0].profile_analysis, [0, 100, 0]);
});

test('rapid coalesced changes send only the newest Streamlit envelope', async () => {
  const received = [];
  registerApiHandlers({ profiles: result => received.push(result), error: error => { throw new Error(error); }, activity: () => {} });
  const start = sentRequests().length;
  requestProfiles({ image: 'first', peak_threshold: 20 });
  requestProfiles({ image: 'second', peak_threshold: 30 });
  requestProfiles({ image: 'latest', peak_threshold: 40 });
  await until(() => sentRequests().length === start + 1);
  const request = sentRequests().at(-1);
  assert.equal(request.payload.image, 'latest');
  deliver(profileResponse(request, 'latest'));
  assert.equal(received.length, 1);
  assert.equal(received[0].results[0].id, 'latest');
});

test('a standalone component reports a nonmodal Streamlit-host error without sending a request', () => {
  const errors = []; const activity = [];
  registerApiHandlers({ profiles: () => {}, crop: () => {}, error: message => errors.push(message), activity: (action, busy) => activity.push({ action, busy }) });
  const originalParent = window.parent;
  window.parent = window;
  const start = sentRequests().length;
  assert.equal(requestProfiles({ image: 'standalone' }, { coalesce: false }), null);
  assert.equal(requestCrop({ image: 'standalone' }), null);
  assert.equal(sentRequests().length, start);
  assert.equal(errors.length, 2);
  assert.ok(errors.every(message => /Streamlit deployment/i.test(message)));
  assert.ok(activity.every(entry => entry.busy === false));
  window.parent = originalParent;
});

test('a profile reply survives a Streamlit iframe reload', async () => {
  sessionStorageValues.clear();
  window.__aqTlcRenderCallbacks = [];
  const apiUrl = new URL('../../frontend/modules/api.js', import.meta.url);
  const sender = await import(`${apiUrl.href}?request-sender=${Date.now()}`);
  sender.registerApiHandlers({ profiles: () => {}, crop: () => {}, error: message => { throw new Error(message); }, activity: () => {} });
  const start = sentRequests().length;
  const requestId = sender.requestProfiles({ image: 'reload', peak_threshold: 35 }, { coalesce: false });
  const request = sentRequests().slice(start).at(-1);
  assert.equal(request.request_id, requestId);

  // A Streamlit rerun can recreate the iframe, which discards the sender's
  // module state but preserves sessionStorage for the component origin.
  window.__aqTlcRenderCallbacks = [];
  const receiver = await import(`${apiUrl.href}?request-receiver=${Date.now()}`);
  const received = [];
  receiver.registerApiHandlers({ profiles: result => received.push(result), crop: () => {}, error: message => { throw new Error(message); }, activity: () => {} });
  deliver(profileResponse(request, 'restored'));

  assert.equal(received.length, 1);
  assert.equal(received[0].results[0].id, 'restored');
  assert.equal(JSON.parse(sessionStorageValues.get('aq_tlc_mobile_pending_requests_v1')).generate_profiles, undefined);
});

test('only a current in-flight request permits temporary workspace restoration', () => {
  clearPendingRequests();
  assert.equal(hasPendingRequests(), false);

  requestProfiles({ image: 'temporary', peak_threshold: 50 }, { coalesce: false });
  assert.equal(hasPendingRequests(), true);

  clearPendingRequests();
  assert.equal(hasPendingRequests(), false);
  assert.equal(sessionStorageValues.has('aq_tlc_mobile_pending_requests_v1'), false);
});

test('expired request metadata cannot reopen a previous workspace', () => {
  clearPendingRequests();
  sessionStorageValues.set('aq_tlc_mobile_pending_requests_v1', JSON.stringify({
    crop: { request_id: 'old-crop', created_at: Date.now() - 10 * 60 * 1000 },
  }));

  assert.equal(hasPendingRequests(), false);
  assert.deepEqual(JSON.parse(sessionStorageValues.get('aq_tlc_mobile_pending_requests_v1')), {});
});
