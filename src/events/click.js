import { extractTarget } from '../selectors/extract.js';

export function initClickCapture(emit) {
  document.addEventListener('click', (e) => {
    const target = extractTarget(e.target);
    if (!target) return;

    emit('click', target, {
      modifiers: getModifiers(e),
      button: e.button === 2 ? 'right' : 'left',
    }, e.target);
  }, true);

  document.addEventListener('dblclick', (e) => {
    const target = extractTarget(e.target);
    if (!target) return;

    emit('dblclick', target, {
      modifiers: getModifiers(e),
    });
  }, true);

  document.addEventListener('contextmenu', (e) => {
    const target = extractTarget(e.target);
    if (!target) return;

    emit('right_click', target, {
      modifiers: getModifiers(e),
    });
  }, true);
}

function getModifiers(e) {
  const mods = [];
  if (e.shiftKey) mods.push('Shift');
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  return mods.length > 0 ? mods : undefined;
}
