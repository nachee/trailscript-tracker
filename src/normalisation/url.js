/**
 * URL normalisation for data minimisation (P1-1, P1-2).
 *
 * Captured URLs routinely carry secrets in the query string (?token=, ?reset=,
 * session ids) and in the fragment (#access_token=...). We keep only the
 * origin + pathname — enough for flow analysis (the downstream
 * analysis/src/normalisation/url_normaliser.py already discards the query, so
 * this loses nothing analytically) while dropping the sensitive tail before it
 * ever leaves the browser.
 *
 * Pure string logic (only the URL parser), so it is unit-testable directly.
 */

/**
 * Reduce a URL to origin + pathname, dropping the query string and fragment.
 *
 * @param {string|null|undefined} url - absolute or relative URL
 * @returns {string|null|undefined} origin+pathname (e.g.
 *   "https://app.example.com/settings"), a best-effort query/fragment-stripped
 *   string for values that don't parse as URLs, or the input unchanged when it
 *   is null/undefined/non-string.
 */
export function normalizeUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return url;
  try {
    const parsed = new URL(url, location.origin);
    return parsed.origin + parsed.pathname;
  } catch {
    // Fallback for values that don't parse as URLs: strip query and fragment.
    return String(url).split(/[?#]/)[0];
  }
}
