/**
 * TrailScript Tracker — Main entry point.
 * IIFE global: window.__trailscript
 */

import { init as initSession, getSessionId, getTabId, nextSequence, destroy as destroySession, uuidv4 } from './session/session-manager.js';
import { extractTarget } from './selectors/extract.js';
import { initClickCapture } from './events/click.js';
import { initFillCapture } from './events/fill.js';
import { initNavigateCapture } from './events/navigate.js';
import { initKeypressCapture } from './events/keypress.js';
import { initScrollCapture } from './events/scroll.js';
import { initHoverCapture } from './events/hover.js';
import { initDragDropCapture } from './events/drag-drop.js';
import { initFileUploadCapture } from './events/file-upload.js';
import { initDialogCapture } from './events/dialog.js';
import { initNetworkInterceptor } from './network/interceptor.js';
import { captureCheckpoint, initConsoleCapture } from './checkpoints/checkpoint.js';
import { initTransport, queueEvent, queueCheckpoint, destroy as destroyTransport } from './transport/transport.js';

let initialized = false;
let checkpointObserver = null;
let clickSettleTimer = null;
let lastClickEventId = null;
let lastClickRawTarget = null;

/**
 * Emit an event — creates the full event object and queues it for transport.
 * @param {string} eventType
 * @param {object} target - Extracted target selectors
 * @param {object} payload
 * @param {Element} [rawElement] - Raw DOM element (for click context capture)
 */
function emit(eventType, target, payload, rawElement) {
  if (!initialized) return;

  const event = {
    schema_version: 1,
    event_id: uuidv4(),
    session_id: getSessionId(),
    tab_id: getTabId(),
    sequence: nextSequence(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    page: {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    target: target || undefined,
    payload: payload || {},
  };

  queueEvent(event);

  // Trigger checkpoint on navigation or form submission
  if (shouldCheckpoint(eventType, payload)) {
    // Cancel any pending click-settle timer (navigation checkpoint takes priority)
    if (clickSettleTimer) {
      clearTimeout(clickSettleTimer);
      clickSettleTimer = null;
      lastClickEventId = null;
      lastClickRawTarget = null;
    }
    setTimeout(() => {
      const checkpoint = captureCheckpoint(event.event_id, getSessionId());
      queueCheckpoint(checkpoint);
    }, 100); // Small delay to let DOM settle
  } else if (eventType === 'click') {
    // Schedule a settle checkpoint after click sequences finish.
    // Debounced: resets on each click, fires 500ms after the last click.
    if (clickSettleTimer) clearTimeout(clickSettleTimer);
    lastClickEventId = event.event_id;
    lastClickRawTarget = rawElement || null;
    clickSettleTimer = setTimeout(() => {
      const checkpoint = captureCheckpoint(lastClickEventId, getSessionId(), lastClickRawTarget);
      queueCheckpoint(checkpoint);
      clickSettleTimer = null;
      lastClickEventId = null;
      lastClickRawTarget = null;
    }, 500);
  }
}

function shouldCheckpoint(eventType, payload) {
  return (
    eventType === 'navigation' ||
    eventType === 'page_load' ||
    (eventType === 'click' && payload?.formSubmit)
  );
}

/**
 * Initialize the tracker.
 */
function start(config = {}) {
  if (initialized) return;

  const ingestionUrl = config.ingestionUrl || window.__trailscript_config?.ingestionUrl || '';
  const siteKey = config.siteKey || window.__trailscript_config?.siteKey || '';

  if (!ingestionUrl || !siteKey) {
    console.warn('[TrailScript] Missing ingestionUrl or siteKey');
    return;
  }

  // Initialize session management
  initSession();

  // Initialize transport
  initTransport({ ingestionUrl, siteKey });

  // Initialize console error capture
  initConsoleCapture();

  // Initialize event capture modules
  initClickCapture(emit);
  initFillCapture(emit);
  initNavigateCapture(emit);
  initKeypressCapture(emit);
  initScrollCapture(emit);
  initHoverCapture(emit);
  initDragDropCapture(emit);
  initFileUploadCapture(emit);
  initDialogCapture(emit);
  initNetworkInterceptor(emit);

  // Watch for significant DOM mutations to trigger checkpoints
  initMutationCheckpoints();

  initialized = true;

  // Emit initial navigation event
  emit('navigation', null, {
    to_url: location.href,
    trigger: 'page_load',
  });
}

function initMutationCheckpoints() {
  if (!window.MutationObserver) return;

  let mutationTimeout = null;
  let mutationCount = 0;

  checkpointObserver = new MutationObserver((mutations) => {
    // Count significant mutations (added/removed nodes, not just attribute changes)
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        mutationCount += m.addedNodes.length + m.removedNodes.length;
      }
    }

    // Debounce: checkpoint after DOM settles (300ms) with significant changes (>5 nodes)
    if (mutationCount > 5) {
      if (mutationTimeout) clearTimeout(mutationTimeout);
      mutationTimeout = setTimeout(() => {
        if (mutationCount > 5) {
          const checkpoint = captureCheckpoint(null, getSessionId());
          queueCheckpoint(checkpoint);
        }
        mutationCount = 0;
      }, 300);
    }
  });

  if (document.body) {
    checkpointObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        checkpointObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
}

function stop() {
  if (!initialized) return;
  initialized = false;

  if (clickSettleTimer) {
    clearTimeout(clickSettleTimer);
    clickSettleTimer = null;
    lastClickEventId = null;
    lastClickRawTarget = null;
  }

  if (checkpointObserver) {
    checkpointObserver.disconnect();
    checkpointObserver = null;
  }

  destroyTransport();
  destroySession();
}

// Auto-start when __trailscript_config is present (set by tracking snippet)
if (typeof window !== 'undefined' && window.__trailscript_config) {
  start(window.__trailscript_config);
}

// Export API
export { start, stop, emit };
