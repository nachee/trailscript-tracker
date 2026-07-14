/**
 * API request interceptor — monkey-patches fetch and XMLHttpRequest
 * to capture method, URL, status, and duration for api_request events.
 */

import { addApiCall } from '../checkpoints/checkpoint.js';

export function initNetworkInterceptor(emit) {
  interceptFetch(emit);
  interceptXHR(emit);
}

function interceptFetch(emit) {
  const origFetch = window.fetch;
  if (!origFetch) return;

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = init?.method || (typeof input === 'object' ? input.method : 'GET') || 'GET';

    // Only capture same-origin or relative URLs
    if (!shouldCapture(url)) {
      return origFetch.apply(this, arguments);
    }

    const startTime = Date.now();

    try {
      const response = await origFetch.apply(this, arguments);
      const duration = Date.now() - startTime;

      const callData = {
        method: method.toUpperCase(),
        url: normalizeUrl(url),
        status: response.status,
        duration_ms: duration,
      };

      addApiCall(callData);

      emit('api_request', null, {
        ...callData,
        request_headers: undefined, // Stripped for security
        request_body: undefined,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      emit('api_error', null, {
        method: method.toUpperCase(),
        url: normalizeUrl(url),
        status: 0,
        error_message: error.message,
        duration_ms: duration,
      });

      throw error;
    }
  };
}

function interceptXHR(emit) {
  const OrigXHR = window.XMLHttpRequest;
  if (!OrigXHR) return;

  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method, url) {
    this._arMethod = method;
    this._arUrl = url;
    return origOpen.apply(this, arguments);
  };

  OrigXHR.prototype.send = function () {
    if (!shouldCapture(this._arUrl)) {
      return origSend.apply(this, arguments);
    }

    const startTime = Date.now();
    const method = this._arMethod;
    const url = this._arUrl;

    this.addEventListener('loadend', () => {
      const duration = Date.now() - startTime;

      const callData = {
        method: (method || 'GET').toUpperCase(),
        url: normalizeUrl(url),
        status: this.status,
        duration_ms: duration,
      };

      addApiCall(callData);

      if (this.status >= 400 || this.status === 0) {
        emit('api_error', null, {
          ...callData,
          error_message: this.statusText || undefined,
        });
      } else {
        emit('api_request', null, callData);
      }
    });

    return origSend.apply(this, arguments);
  };
}

function shouldCapture(url) {
  if (!url) return false;
  // Capture same-origin and relative URLs
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url, location.origin);
    return parsed.origin === location.origin;
  } catch {
    return false;
  }
}

function normalizeUrl(url) {
  // M-1: drop the query string entirely. Query params routinely carry secrets
  // (?token=, ?reset=, session ids), and downstream URL normalisation
  // (analysis/src/normalisation/url_normaliser.py) already discards the query,
  // so keeping the path-only form loses nothing for flow analysis.
  try {
    const parsed = new URL(url, location.origin);
    return parsed.pathname;
  } catch {
    // Fallback for values that don't parse as URLs: strip anything after '?'.
    return String(url).split('?')[0];
  }
}
