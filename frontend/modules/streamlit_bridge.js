/**
 * Minimal Streamlit custom-component bridge.  Messages are accepted only from
 * the parent frame and only when they carry Streamlit's component marker.
 */

function post(message) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ isStreamlitMessage: true, ...message }, '*');
  }
}

export function isStreamlitRuntime() {
  return window.parent !== window;
}

export function stReady() {
  if (window.__aqTlcReadySent) return;
  window.__aqTlcReadySent = true;
  post({ type: 'streamlit:componentReady', apiVersion: 1 });
}

export function stSend(value) {
  post({ type: 'streamlit:setComponentValue', value });
}

export function stSetHeight(height) {
  post({ type: 'streamlit:setFrameHeight', height: height ?? document.documentElement.scrollHeight });
}

export function stOnRender(callback) {
  if (!window.__aqTlcRenderCallbacks) window.__aqTlcRenderCallbacks = [];
  window.__aqTlcRenderCallbacks.push(callback);
  const queued = window.__aqTlcRenderQueue || [];
  window.__aqTlcRenderQueue = [];
  queued.forEach(callback);
}

function receive(event) {
  const message = event.data;
  if (event.source !== window.parent || !message?.isStreamlitMessage || message.type !== 'streamlit:render') return;
  const args = message.args || {};
  const callbacks = window.__aqTlcRenderCallbacks || [];
  if (callbacks.length === 0) {
    if (!window.__aqTlcRenderQueue) window.__aqTlcRenderQueue = [];
    window.__aqTlcRenderQueue.push(args);
    return;
  }
  callbacks.forEach(callback => callback(args));
}

window.__aqTlcBridgeLive = true;
window.addEventListener('message', receive);
