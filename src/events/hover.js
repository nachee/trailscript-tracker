import { extractTarget } from '../selectors/extract.js';

let hoverTimeout = null;
let lastHoveredEl = null;

export function initHoverCapture(emit) {
  document.addEventListener('mouseover', (e) => {
    const el = e.target;
    if (el === lastHoveredEl) return;

    if (hoverTimeout) clearTimeout(hoverTimeout);

    // Only emit hover for interactive or significant elements after 500ms dwell
    hoverTimeout = setTimeout(() => {
      if (!isSignificantHover(el)) return;

      lastHoveredEl = el;
      const target = extractTarget(el);
      if (target) {
        emit('hover', target, {});
      }
    }, 500);
  }, true);
}

function isSignificantHover(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  // Only track hover on interactive/meaningful elements
  return (
    tag === 'A' ||
    tag === 'BUTTON' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    el.getAttribute('role') ||
    el.getAttribute('data-testid') ||
    el.getAttribute('title') ||
    el.classList.contains('tooltip') ||
    el.closest('[role="tooltip"]') ||
    el.closest('[role="menu"]')
  );
}
