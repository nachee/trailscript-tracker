/**
 * Universal free-text value normalization.
 *
 * All free-text input values are replaced with type-appropriate synthetic
 * placeholders at capture time. Constrained inputs (select, checkbox, radio)
 * keep their actual values as they affect flow branching.
 *
 * This is one of several PII-minimisation layers, not a blanket guarantee.
 * Input *values* are synthesised here; separately, captured page text
 * (`text_content`) and API URLs still originate from the live page, so they are
 * scrubbed at capture time by `normalisation/redact.js` (PII-pattern redaction)
 * and query-string stripping in `network/interceptor.js`. Raw input `value` is
 * no longer captured in click-context. Net effect: high-signal PII (passwords,
 * emails, phone numbers, card/token-like strings, query-param secrets) is
 * masked or redacted before anything leaves the browser — but this is
 * best-effort pattern-based scrubbing, not a proof that zero user data is ever
 * transmitted.
 */

const SYNTHETIC_BY_TYPE = {
  password: 'TestPass123!',
  email: 'user@example.com',
  tel: '555-0100',
  number: '42',
  url: 'https://example.com',
  search: 'test search',
};

const DEFAULT_SYNTHETIC = 'test value';

export { DEFAULT_SYNTHETIC };

export function syntheticValue(el) {
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return SYNTHETIC_BY_TYPE[type] || DEFAULT_SYNTHETIC;
}

export function isTextInput(el) {
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return type === 'text' || type === 'password' || type === 'email'
    || type === 'search' || type === 'url' || type === 'tel' || type === 'number';
}
