import { extractTarget } from '../selectors/extract.js';

const SPECIAL_KEYS = new Set([
  'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function initKeypressCapture(emit) {
  document.addEventListener('keydown', (e) => {
    // Only capture special keys and key combos (not regular typing)
    const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
    const isSpecial = SPECIAL_KEYS.has(e.key);

    if (!hasModifier && !isSpecial) return;

    const target = extractTarget(e.target);
    const keyCombo = buildKeyCombo(e);

    emit('press_key', target, {
      key: keyCombo,
      repeat: e.repeat ? 1 : undefined,
    });
  }, true);
}

function buildKeyCombo(e) {
  const parts = [];
  if (e.altKey) parts.push('Alt');
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Meta');
  if (e.shiftKey) parts.push('Shift');
  if (!['Alt', 'Control', 'Meta', 'Shift'].includes(e.key)) {
    parts.push(e.key);
  }
  return parts.join('+');
}
