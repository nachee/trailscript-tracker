/**
 * Session manager — sessionStorage persistence + BroadcastChannel cross-tab coordination.
 * Generates UUID v4 session and tab IDs.
 */

const SESSION_KEY = '__trailscript_session_id';
const TAB_KEY = '__trailscript_tab_id';
const SEQUENCE_KEY = '__trailscript_sequence';
const CHANNEL_NAME = '__trailscript_session_sync';

function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID: build an RFC-4122 v4
  // UUID from CSPRNG bytes so the entropy is cryptographic, not Math.random().
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = [];
    for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  // Last resort only if no crypto is available at all — never throw.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
