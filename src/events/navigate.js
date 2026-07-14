let lastUrl = '';

export function initNavigateCapture(emit) {
  lastUrl = location.href;

  // SPA history changes (pushState, replaceState)
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    origPushState.apply(this, args);
    onUrlChange(emit, 'history_push');
  };

  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    onUrlChange(emit, 'history_push');
  };

  window.addEventListener('popstate', () => {
    onUrlChange(emit, 'history_pop');
  });

  // Traditional navigation
  window.addEventListener('beforeunload', () => {
    // Session end checkpoint will be triggered separately
  });

  // Hash changes
  window.addEventListener('hashchange', () => {
    onUrlChange(emit, 'history_push');
  });

  // Page load
  window.addEventListener('load', () => {
    emit('page_load', null, { load_state: 'load' });
  });

  // DOMContentLoaded (if not already fired)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      emit('page_load', null, { load_state: 'domcontentloaded' });
    });
  }
}

function onUrlChange(emit, trigger) {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;

  const fromUrl = lastUrl;
  lastUrl = newUrl;

  emit('navigation', null, {
    to_url: newUrl,
    from_url: fromUrl,
    trigger,
  });
}
