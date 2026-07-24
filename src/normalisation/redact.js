/**
 * PII redaction for captured free text (M-1).
 *
 * DOM `text_content` is captured to drive Playwright `getByText()` locators, so
 * it cannot be dropped wholesale — but raw page text routinely contains user
 * PII (a logged-in user's email in a header, an order confirmation with a phone
 * number or card digits, opaque tokens in status text). This helper redacts the
 * high-signal PII patterns while leaving structural label text ("Dashboard",
 * "Submit", "Total: 5 items") intact so locators keep working.
 *
 * Pure string logic (no DOM), so it is unit-testable directly.
 */

export const REDACTED = '[redacted]';

// Order matters: broader/greedier patterns (email, card, phone) run before the
// generic long-digit / long-token sweeps so a card isn't half-eaten first.
const PATTERNS = [
  // Email addresses.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Credit-card-like runs: 13–19 digits, optionally grouped by spaces/hyphens.
  /\b(?:\d[ -]?){13,19}\b/g,
  // Phone numbers: optional +, optional (area), 7+ digits with separators.
  /(?<!\w)\+?\d(?:[\d ().-]{6,}\d)/g,
  // Standalone long digit runs (>= 7 digits) — account/order/SSN-like numbers.
  /(?<!\w)\d{7,}(?!\w)/g,
  // Long opaque alphanumeric tokens (>= 20 chars) — session ids, API tokens,
  // hashes. Must contain at least one digit and one letter to avoid nuking
  // ordinary long words.
  /(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{20,}(?![\w-])/g,
];

/**
 * Redact PII patterns from a text string.
 *
 * @param {string|null|undefined} text
 * @returns {string|null|undefined} the input with PII replaced by `[redacted]`;
 *   passes through null/undefined/non-strings unchanged.
 */
export function redactPII(text) {
  if (typeof text !== 'string' || text.length === 0) return text;

  let out = text;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/** Default cap for free-text diagnostic messages (console errors, dialogs). */
export const MAX_MESSAGE_LEN = 500;

/**
 * Sanitise a free-text diagnostic message (P1-3): redact PII, then cap length.
 *
 * Console errors, window.onerror messages, unhandled-rejection reasons, and
 * native dialog text are attacker-uncontrolled but frequently echo user input
 * (a failed request URL with a token, a validation error quoting an email), so
 * they must be redacted and length-bounded before buffering.
 *
 * @param {string} text
 * @param {number} [maxLen=MAX_MESSAGE_LEN]
 * @returns {string} redacted, length-capped message
 */
export function redactMessage(text, maxLen = MAX_MESSAGE_LEN) {
  const redacted = redactPII(typeof text === 'string' ? text : String(text ?? ''));
  return typeof redacted === 'string' && redacted.length > maxLen
    ? redacted.slice(0, maxLen)
    : redacted;
}
