import { PROTOCOL_VERSION, SMOOTH_SIGMA } from './constants.js';
import { migrateLaneSchema } from './analysis.js';
import { isStreamlitRuntime, stOnRender, stSend } from './streamlit_bridge.js';

let sequence = 0;
const latestRequestByAction = new Map();
const deliveredRequestByAction = new Map();
const profileSettingsByRequest = new Map();
const handlers = { profiles: null, crop: null, error: null, activity: null };
let queuedProfiles = null;
let profileTimer = null;

export function registerApiHandlers(nextHandlers) {
  Object.assign(handlers, nextHandlers);
}

function requestId(action) {
  sequence += 1;
  return `${action}-${Date.now().toString(36)}-${sequence}`;
}

function emitError(error) {
  handlers.error?.(error?.message || 'The analysis service could not complete that request.', error);
}

function normaliseProfileResult(result, threshold) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.profile_display) || !Array.isArray(result.profile_analysis)) {
    throw new TypeError('The analysis service returned a profile in an unsupported format.');
  }
  const next = { ...result };
  return migrateLaneSchema(next, threshold);
}

function handleResponse(response) {
  if (!response || typeof response !== 'object') return;
  const action = String(response.action || '').replace(/_result$/, '');
  const id = String(response.request_id ?? '');
  if (!action || !id || latestRequestByAction.get(action) !== id) return;
  if (deliveredRequestByAction.get(action) === id) return;
  deliveredRequestByAction.set(action, id);
  const profileSettings = action === 'generate_profiles' ? profileSettingsByRequest.get(id) : null;
  // Context includes a base64 image, so remove it for both success and error
  // responses as soon as this response is current and handled.
  if (action === 'generate_profiles') profileSettingsByRequest.delete(id);
  handlers.activity?.(action, false);
  if (response.protocol_version !== PROTOCOL_VERSION || response.ok !== true) {
    emitError(response.error || { message: 'The analysis service returned an invalid response.' });
    return;
  }
  if (action === 'generate_profiles') {
    const threshold = profileSettings?.peak_threshold ?? 50;
    const data = response.data || {};
    try {
      const results = (data.results || []).map(result => normaliseProfileResult(result, threshold));
      handlers.profiles?.({ ...data, results });
    } catch (error) {
      emitError({ code: 'INVALID_RESPONSE', message: error.message, retryable: true });
    }
  } else if (action === 'crop') {
    handlers.crop?.(response.data || {});
  }
}

stOnRender(args => handleResponse(args?.response));

function reportMissingHost(action) {
  handlers.activity?.(action, false);
  emitError({
    code: 'STREAMLIT_HOST_UNAVAILABLE',
    message: 'AQ-TLC Mobile must be opened through its Streamlit deployment. The analysis service is unavailable in this standalone page.',
    retryable: false,
  });
}

function dispatch(action, payload, id = requestId(action)) {
  if (!isStreamlitRuntime()) {
    if (action === 'generate_profiles') profileSettingsByRequest.delete(id);
    reportMissingHost(action);
    return null;
  }
  latestRequestByAction.set(action, id);
  handlers.activity?.(action, true);
  const envelope = { protocol_version: PROTOCOL_VERSION, action, request_id: id, payload };
  stSend(envelope);
  return id;
}

export function requestProfiles(payload, { coalesce = true } = {}) {
  if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; }
  if (!isStreamlitRuntime()) {
    queuedProfiles = null;
    profileSettingsByRequest.clear();
    reportMissingHost('generate_profiles');
    return null;
  }
  const id = requestId('generate_profiles');
  // Invalidate any in-flight profile result as soon as the user changes a
  // setting, not only when the debounce window finishes.
  latestRequestByAction.set('generate_profiles', id);
  // A user can scrub settings repeatedly.  Only the newest payload may ever
  // be sent or applied, so retaining earlier images would be needless memory
  // pressure on a phone.
  profileSettingsByRequest.clear();
  profileSettingsByRequest.set(id, payload);
  queuedProfiles = { payload, id };
  handlers.activity?.('generate_profiles', true);
  if (!coalesce) {
    queuedProfiles = null;
    return dispatch('generate_profiles', payload, id);
  }
  profileTimer = setTimeout(() => {
    profileTimer = null;
    const next = queuedProfiles;
    queuedProfiles = null;
    if (next) dispatch('generate_profiles', next.payload, next.id);
  }, 180);
  return null;
}

export function requestCrop(payload) {
  return dispatch('crop', payload);
}

export function buildProfilePayload(image, lanes, settings, detectPeaks) {
  return {
    image,
    lanes,
    peak_detection: Boolean(detectPeaks),
    peak_prominence: Number(settings.peakProminence),
    peak_distance: Number(settings.peakDistance),
    peak_threshold: Number(settings.peakThreshold),
    smooth_sigma: SMOOTH_SIGMA,
    polarity_mode: settings.polarityMode,
    target_wavelength: settings.targetWavelength,
    invert_colors: Boolean(settings.invertColors),
  };
}
