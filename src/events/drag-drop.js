import { extractTarget, extractSelectors } from '../selectors/extract.js';

export function initDragDropCapture(emit) {
  let dragSource = null;
  let dragSourcePos = null;

  document.addEventListener('dragstart', (e) => {
    dragSource = e.target;
    dragSourcePos = { x: e.clientX, y: e.clientY };
  }, true);

  document.addEventListener('drop', (e) => {
    if (!dragSource) return;

    const sourceTarget = extractTarget(dragSource);
    const dropTargetSelectors = extractSelectors(e.target);

    if (sourceTarget) {
      emit('drag_drop', sourceTarget, {
        target_selectors: dropTargetSelectors,
        source_position: dragSourcePos,
        target_position: { x: e.clientX, y: e.clientY },
      });
    }

    dragSource = null;
    dragSourcePos = null;
  }, true);

  document.addEventListener('dragend', () => {
    dragSource = null;
    dragSourcePos = null;
  }, true);
}
