/**
 * Multi-strategy selector extractor.
 * Extracts role, testid, text, placeholder, CSS, XPath, nth strategies per element.
 */

import { redactPII } from '../normalisation/redact.js';

/**
 * Extract all selector strategies for a DOM element.
 * @param {Element} el
 * @returns {object} selectors object matching event-schema.md Section 3
 */
export function extractSelectors(el) {
  if (!el || !el.tagName) return null;

  return {
    css: extractCss(el),
    xpath: extractXPath(el),
    text: extractText(el),
    role: extractRole(el),
    testid: extractTestId(el),
    nth: extractNth(el),
    placeholder: extractPlaceholder(el),
  };
}

/**
 * Extract full target info including selectors, tag, attributes, bounding box.
 */
export function extractTarget(el) {
  if (!el || !el.tagName) return null;

  const inIframe = isInIframe(el);

  return {
    selectors: extractSelectors(el),
    tag: el.tagName,
    attributes: extractAttributes(el),
    text_content: getTextContent(el),
    bounding_box: getBoundingBox(el),
    is_in_iframe: inIframe,
    iframe_selector: inIframe ? getIframeSelector(el) : null,
  };
}

function extractCss(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).map((c) => `.${CSS.escape(c)}`).join('');
  if (classes) return `${tag}${classes}`;
  // Attribute-based fallback
  const name = el.getAttribute('name');
  if (name) return `${tag}[name="${name}"]`;
  const type = el.getAttribute('type');
  if (type) return `${tag}[type="${type}"]`;
  return tag;
}

function extractXPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === node.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    const tag = node.tagName.toLowerCase();
    const id = node.id;
    if (id) {
      parts.unshift(`//${tag}[@id='${id}']`);
      break;
    }
    parts.unshift(index > 0 ? `${tag}[${index + 1}]` : tag);
    node = node.parentNode;
  }
  return '/' + parts.join('/');
}

function extractText(el) {
  const text = getTextContent(el);
  return text && text.length <= 100 ? text : null;
}

function extractRole(el) {
  const role = el.getAttribute('role') || getImplicitRole(el);
  if (!role) return null;
  const name =
    el.getAttribute('aria-label') ||
    getAriaLabelledByText(el) ||
    getLabelText(el) ||
    getTextContent(el);
  return { role, name: name && name.length <= 100 ? name : null };
}

function getAriaLabelledByText(el) {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return null;
  const parts = ids.split(/\s+/).map((id) => {
    const ref = document.getElementById(id);
    return ref ? ref.textContent?.trim() : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

function getLabelText(el) {
  // Method 1: explicit <label for="id"> association
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) {
      const text = label.textContent?.trim();
      if (text) return text;
    }
  }
  // Method 2: wrapping <label> element
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  return null;
}

function getImplicitRole(el) {
  const tag = el.tagName;
  const type = el.getAttribute('type');
  const roles = {
    BUTTON: 'button',
    A: 'link',
    INPUT: type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : 'textbox',
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    H1: 'heading',
    H2: 'heading',
    H3: 'heading',
    H4: 'heading',
    H5: 'heading',
    H6: 'heading',
    IMG: 'img',
    NAV: 'navigation',
    MAIN: 'main',
    FORM: 'form',
    TABLE: 'table',
  };
  return roles[tag] || null;
}

function extractTestId(el) {
  return el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null;
}

function extractNth(el) {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentNode;
  if (!parent) return null;
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (siblings.length <= 1) return null;
  const index = siblings.indexOf(el);
  return { selector: tag, index };
}

function extractPlaceholder(el) {
  return el.getAttribute('placeholder') || null;
}

function extractAttributes(el) {
  return {
    id: el.id || null,
    class: el.className || null,
    type: el.getAttribute('type') || null,
    'data-testid': el.getAttribute('data-testid') || null,
    'aria-label': el.getAttribute('aria-label') || null,
    href: el.getAttribute('href') || null,
  };
}

function getTextContent(el) {
  const text = (el.textContent || '').trim();
  // M-1: redact PII from text used for getByText() locators before storage.
  return text.length > 0 ? redactPII(text.substring(0, 200)) : null;
}

function getBoundingBox(el) {
  try {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  } catch {
    return null;
  }
}

function isInIframe(el) {
  try {
    return el.ownerDocument !== window.document;
  } catch {
    return false;
  }
}

function getIframeSelector(el) {
  try {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument === el.ownerDocument) {
          return extractCss(iframe);
        }
      } catch {
        // Cross-origin iframe
      }
    }
  } catch {
    // Ignore
  }
  return null;
}
