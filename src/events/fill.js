import { extractTarget } from '../selectors/extract.js';
import { syntheticValue, isTextInput } from '../normalisation/synthetic.js';

const previousValues = new WeakMap();
const emittedValues = new WeakMap(); // Track last emitted value to avoid duplicates
const inputTimers = new WeakMap(); // Debounce timers for input events

const INPUT_DEBOUNCE_MS = 300;

export function initFillCapture(emit) {
  // Track focus to capture previous values
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (isInputElement(el)) {
      previousValues.set(el, el.value || '');
    }
  }, true);

  // Debounced input listener — captures fills without waiting for blur.
  // This ensures the last field filled before page close is not lost.
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!isInputElement(el)) return;
    if (!isTextInput(el)) return;

    // Clear any pending debounce for this element
    const existing = inputTimers.get(el);
    if (existing) clearTimeout(existing);

    inputTimers.set(el, setTimeout(() => {
      inputTimers.delete(el);
      emitFill(emit, el);
    }, INPUT_DEBOUNCE_MS));
  }, true);

  // Change listener — fires on blur when value changed.
  // Acts as a reliable backup and handles checkbox/radio/select.
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!isInputElement(el)) return;

    const target = extractTarget(el);
    if (!target) return;

    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Checkbox / radio → check event
    if (type === 'checkbox' || type === 'radio') {
      emit('check', target, { checked: el.checked });
      return;
    }

    // Select → select_option event
    if (tag === 'SELECT') {
      const selected = el.options[el.selectedIndex];
      emit('select_option', target, {
        value: el.value,
        label: selected ? selected.textContent.trim() : null,
        index: el.selectedIndex,
      });
      return;
    }

    // Text inputs / textarea → fill event (cancel any pending debounce)
    const pending = inputTimers.get(el);
    if (pending) {
      clearTimeout(pending);
      inputTimers.delete(el);
    }
    emitFill(emit, el);
  }, true);
}

function emitFill(emit, el) {
  const prev = previousValues.get(el) || '';
  const current = el.value;

  // Skip if value hasn't changed since last emission
  if (current === emittedValues.get(el)) return;
  if (current === prev && !emittedValues.has(el)) return;

  const target = extractTarget(el);
  if (!target) return;

  emittedValues.set(el, current);
  emit('fill', target, {
    value: syntheticValue(el),
  });
}

function isInputElement(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
