/**
 * Session manager — sessionStorage persistence + BroadcastChannel cross-tab coordination.
 * Generates UUID v4 session and tab IDs.
 */

const SESSION_KEY = '__trailscript_session_id';
const TAB_KEY = '__trailscript_tab_id';
const SEQUENCE_KEY = '__trailscript_sequence';
const CHANNEL_NAME = '__trailscript_session_sync';

function uuidv4() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

let sessionId = null;
let tabId = null;
let sequence = 0;
let channel = null;

function init() {
  tabId = uuidv4();

  // Try to get existing session from sessionStorage
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
  } catch {
    // sessionStorage may be unavailable (iframe, privacy mode)
  }

  if (!sessionId) {
    sessionId = uuidv4();
    try {
      sessionStorage.setItem(SESSION_KEY, sessionId);
    } catch {
      // Ignore storage errors
    }
  }

  // Cross-tab coordination via BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'session_query') {
          channel.postMessage({ type: 'session_response', sessionId });
        }
        if (event.data?.type === 'session_response' && !sessionId) {
          sessionId = event.data.sessionId;
          try {
            sessionStorage.setItem(SESSION_KEY, sessionId);
          } catch {
            // Ignore
          }
        }
      };
      // Ask other tabs for existing session
      channel.postMessage({ type: 'session_query' });
    } catch {
      // BroadcastChannel may fail in some environments
    }
  }

  // Restore sequence counter from sessionStorage so it continues
  // across page navigations in multi-page sites.
  try {
    const stored = sessionStorage.getItem(SEQUENCE_KEY);
    sequence = stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    sequence = 0;
  }
}

function getSessionId() {
  return sessionId;
}

function getTabId() {
  return tabId;
}

function nextSequence() {
  ++sequence;
  try {
    sessionStorage.setItem(SEQUENCE_KEY, String(sequence));
  } catch {
    // sessionStorage may be unavailable
  }
  return sequence;
}

function destroy() {
  if (channel) {
    channel.close();
    channel = null;
  }
}

export { init, getSessionId, getTabId, nextSequence, destroy, uuidv4 };
