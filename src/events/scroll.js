let scrollTimeout = null;
let lastScrollY = 0;
let lastScrollX = 0;

export function initScrollCapture(emit) {
  lastScrollY = window.scrollY;
  lastScrollX = window.scrollX;

  window.addEventListener('scroll', () => {
    // Debounce scroll events — emit after 150ms of no scrolling
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      const deltaY = window.scrollY - lastScrollY;
      const deltaX = window.scrollX - lastScrollX;

      if (Math.abs(deltaY) < 50 && Math.abs(deltaX) < 50) return;

      const direction = Math.abs(deltaY) >= Math.abs(deltaX)
        ? (deltaY > 0 ? 'down' : 'up')
        : (deltaX > 0 ? 'right' : 'left');

      emit('scroll', null, {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
        delta_x: Math.round(deltaX),
        delta_y: Math.round(deltaY),
        direction,
      });

      lastScrollY = window.scrollY;
      lastScrollX = window.scrollX;
    }, 150);
  }, { passive: true });
}
