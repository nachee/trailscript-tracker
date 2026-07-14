/**
 * Batch transport — sendBeacon primary, fetch fallback.
 * Retry queue capped at 50 batches with exponential backoff.
 */

const MAX_QUEUE_SIZE = 50;
const FLUSH_INTERVAL = 500; // 500ms — short flows complete in 2-3s, so frequent flushes prevent event loss on page close
const MAX_BATCH_SIZE = 50; // events per batch

let eventBuffer = [];
let checkpointBuffer = [];
let retryQueue = [];
let flushTimer = null;
let ingestionUrl = '';
let siteKey = '';

export function initTransport(config) {
  ingestionUrl = config.ingestionUrl || '';
  siteKey = config.siteKey || '';

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);

  // Flush on page hide (user leaving) — use flushAll to drain the entire buffer
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAll();
    }
  });

  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);

  // Process retry queue
  setInterval(processRetryQueue, 5000);
}

export function queueEvent(event) {
  eventBuffer.push(event);
  if (eventBuffer.length >= MAX_BATCH_SIZE) {
    flush();
  }
}

export function queueCheckpoint(checkpoint) {
  checkpointBuffer.push(checkpoint);
  // Flush any buffered events first so trigger_event_id exists in the DB
  flush();
  // Then send checkpoint immediately (no batching)
  sendCheckpoint(checkpoint);
}

function flush() {
  if (eventBuffer.length === 0) return;

  const batch = eventBuffer.splice(0, MAX_BATCH_SIZE);
  sendEventBatch(batch);
}

function flushAll() {
  // Drain the entire buffer — critical during page unload to avoid losing events
  while (eventBuffer.length > 0) {
    flush();
  }
}

function sendEventBatch(events) {
  const url = `${ingestionUrl}/api/v1/events`;
  // sendBeacon can't set custom headers, so include site_key in body
  const beaconBody = JSON.stringify({ events, site_key: siteKey });
  const fetchBody = JSON.stringify({ events });

  const success = trySendBeacon(url, beaconBody);
  if (!success) {
    trySendFetch(url, fetchBody, events);
  }
}

function sendCheckpoint(checkpoint) {
  const url = `${ingestionUrl}/api/v1/checkpoints`;
  // sendBeacon can't set custom headers, so include site_key in body
  const beaconBody = JSON.stringify({ ...checkpoint, site_key: siteKey });
  const fetchBody = JSON.stringify(checkpoint);

  const success = trySendBeacon(url, beaconBody);
  if (!success) {
    trySendFetch(url, fetchBody, null);
  }
}

function trySendBeacon(url, body) {
  if (!navigator.sendBeacon) return false;

  try {
    const blob = new Blob([body], { type: 'application/json' });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}

async function trySendFetch(url, body, originalEvents) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Site-Key': siteKey,
      },
      body,
      keepalive: true,
    });

    if (!response.ok && originalEvents) {
      addToRetryQueue(url, body);
    }
  } catch {
    if (originalEvents) {
      addToRetryQueue(url, body);
    }
  }
}

function addToRetryQueue(url, body) {
  if (retryQueue.length >= MAX_QUEUE_SIZE) {
    retryQueue.shift(); // Drop oldest
  }
  retryQueue.push({
    url,
    body,
    attempts: 0,
    nextRetry: Date.now() + 1000,
  });
}

async function processRetryQueue() {
  const now = Date.now();
  const pending = retryQueue.filter((r) => r.nextRetry <= now);

  for (const item of pending) {
    try {
      const response = await fetch(item.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Site-Key': siteKey,
        },
        body: item.body,
      });

      if (response.ok) {
        retryQueue = retryQueue.filter((r) => r !== item);
      } else {
        item.attempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s...
        item.nextRetry = now + Math.min(1000 * Math.pow(2, item.attempts), 60000);
        if (item.attempts >= 5) {
          retryQueue = retryQueue.filter((r) => r !== item); // Give up
        }
      }
    } catch {
      item.attempts++;
      item.nextRetry = now + Math.min(1000 * Math.pow(2, item.attempts), 60000);
      if (item.attempts >= 5) {
        retryQueue = retryQueue.filter((r) => r !== item);
      }
    }
  }
}

export function destroy() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush(); // Final flush
}
