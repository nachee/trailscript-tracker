import { extractTarget } from '../selectors/extract.js';

export function initFileUploadCapture(emit) {
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return;
    if (!el.files || el.files.length === 0) return;

    const target = extractTarget(el);
    if (!target) return;

    const filenames = [];
    const mimes = [];
    const sizes = [];

    for (const file of el.files) {
      filenames.push(file.name);
      mimes.push(file.type || 'application/octet-stream');
      sizes.push(file.size);
    }

    emit('file_upload', target, { filenames, mimes, sizes });
  }, true);
}
