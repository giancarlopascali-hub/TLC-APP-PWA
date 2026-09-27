import { init } from './modules/init.js';

try {
  init();
} catch (error) {
  console.error('[AQ-TLC mobile] failed to initialise', error);
  document.body.replaceChildren(Object.assign(document.createElement('main'), { className: 'fatal-error', textContent: `AQ-TLC could not start: ${error.message || error}` }));
}
