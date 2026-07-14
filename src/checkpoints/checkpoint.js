/**
 * DOM checkpoint capture using rrweb-snapshot for selective snapshots.
 * Captures visible elements, form values, focused element, page title,
 * recent API calls, and console errors.
 */

import { extractSelectors } from '../selectors/extract.js';
import { uuidv4 } from '../session/session-manager.js';
import { syntheticValue } from '../normalisation/synthetic.js';
import { redactPII } from '../normalisation/redact.js';

let recentApiCalls = [];
let consoleErrors = [];

export function addApiCall(call) {
  recentApiCalls.push(call);
  // Keep only last 20 API calls
  if (recentApiCalls.length > 20) recentApiCalls.shift();
}

export function addConsoleError(error) {
  consoleErrors.push(error);
  if (consoleErrors.length > 10) consoleErrors.shift();
}

export function initConsoleCapture() {
  const origError = console.error;
  console.error = function (...args) {
    addConsoleError({
      level: 'error',
      message: args.map((a) => String(a)).join(' '),
      source: 'console',
    });
    return origError.apply(this, args);
  };

  window.addEventListener('error', (e) => {
    addConsoleError({
      level: 'error',
      message: e.message || 'Unknown error',
      source: e.filename ? 'script' : 'unknown',
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    addConsoleError({
      level: 'error',
      message: e.reason ? String(e.reason) : 'Unhandled promise rejection',
      source: 'promise',
    });
  });
}

/**
 * Capture a DOM checkpoint at the current moment.
 * @param {string} triggerEventId - The event that caused this checkpoint
 * @param {string} sessionId
 * @param {Element} [clickTarget] - Optional clicked element for contextual capture
 * @returns {object} Checkpoint data matching DOM checkpoint schema
 */
export function captureCheckpoint(triggerEventId, sessionId, clickTarget) {
  const checkpoint = {
    schema_version: 1,
    checkpoint_id: uuidv4(),
    session_id: sessionId,
    trigger_event_id: triggerEventId,
    timestamp: new Date().toISOString(),
    url: location.href,
    visible_elements: captureVisibleElements(),
    form_values: captureFormValues(),
    focused_element: captureFocusedElement(),
    page_title: document.title,
    recent_api_calls: [...recentApiCalls],
    console_errors: [...consoleErrors],
    click_context: clickTarget ? captureClickContext(clickTarget) : null,
    full_snapshot_url: null,
  };

  // Clear accumulated data after checkpoint
  recentApiCalls = [];
  consoleErrors = [];

  return checkpoint;
}

function captureVisibleElements() {
  const elements = [];
  const significant = document.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, [role], button, a, img[alt], [data-testid], ' +
    '.alert, .error, .success, .warning, .notification, [aria-live], ' +
    '[aria-valuenow], [aria-expanded], [aria-selected], [aria-hidden], ' +
    'output, progress, meter, dialog, [aria-modal]'
  );

  for (const el of significant) {
    if (!isVisible(el)) continue;
    if (elements.length >= 75) break;

    const rect = el.getBoundingClientRect();
    elements.push({
      selectors: extractSelectors(el),
      tag: el.tagName,
      text_content: redactPII((el.textContent || '').trim().substring(0, 200)) || null,
      is_visible: true,
      bounding_box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      computed_styles: getRelevantStyles(el),
    });
  }

  return elements;
}

function captureFormValues() {
  const values = [];
  const inputs = document.querySelectorAll('input, textarea, select');

  for (const el of inputs) {
    if (!isVisible(el)) continue;
    if (values.length >= 30) break;

    const type = el.getAttribute('type') || el.tagName.toLowerCase();
    const normalizedType = (type || '').toLowerCase();

    // Constrained inputs keep their actual value; free-text inputs get synthetic
    const isConstrained = el.tagName === 'SELECT'
      || normalizedType === 'checkbox'
      || normalizedType === 'radio';

    values.push({
      selectors: extractSelectors(el),
      value: isConstrained ? (el.value || '') : syntheticValue(el),
      checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : null,
      disabled: el.disabled,
      type,
    });
  }

  return values;
}

function captureFocusedElement() {
  const focused = document.activeElement;
  if (!focused || focused === document.body) return null;
  return { selectors: extractSelectors(focused) };
}

/**
 * Capture DOM context around a clicked element.
 * Walks up to the nearest meaningful container and captures all child
 * elements with their state — catches counter displays, progress bars,
 * modal overlays, and other stateful elements near the click target.
 */
function captureClickContext(clickTarget) {
  if (!clickTarget || !clickTarget.parentElement) return null;

  // Walk up to find a meaningful container (max 3 levels)
  let container = clickTarget.parentElement;
  for (let i = 0; i < 3 && container.parentElement; i++) {
    const tag = container.tagName.toLowerCase();
    // Stop at semantic containers
    if (
      container.getAttribute('role') ||
      container.getAttribute('data-testid') ||
      ['section', 'article', 'main', 'aside', 'nav', 'form'].includes(tag) ||
      (tag === 'div' && container.className)
    ) {
      break;
    }
    container = container.parentElement;
  }

  const elements = [];
  const children = container.querySelectorAll('*');

  for (const el of children) {
    if (elements.length >= 15) break;
    if (!isVisible(el)) continue;

    // Skip the click target itself (we already know about it)
    if (el === clickTarget) continue;

    // Capture elements that likely hold state
    const text = (el.textContent || '').trim().substring(0, 200);
    if (!text && !el.getAttribute('aria-valuenow') && !el.style.width) continue;

    const rect = el.getBoundingClientRect();
    elements.push({
      selectors: extractSelectors(el),
      tag: el.tagName,
      // M-1: redact PII from captured page text before it leaves the browser.
      text_content: redactPII(text) || null,
      attributes: {
        'aria-valuenow': el.getAttribute('aria-valuenow'),
        'aria-expanded': el.getAttribute('aria-expanded'),
        'aria-hidden': el.getAttribute('aria-hidden'),
        'aria-selected': el.getAttribute('aria-selected'),
        style: el.style.cssText || null,
        // M-1: raw input `value` intentionally NOT captured here. It bypassed
        // the synthetic-value masking (see normalisation/synthetic.js) and had
        // no locator benefit, leaking passwords/emails/SSNs in cleartext.
      },
      bounding_box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  return elements.length > 0 ? elements : null;
}

function isVisible(el) {
  if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function getRelevantStyles(el) {
  try {
    const style = getComputedStyle(el);
    return {
      color: style.color,
      'font-size': style.fontSize,
      'background-color': style.backgroundColor,
    };
  } catch {
    return {};
  }
}

