# Tracker

Lightweight client-side JavaScript tracking script that captures user interactions on client sites and sends them to the Ingestion API. Built with vanilla JS and rrweb-snapshot for selective DOM checkpoints. Targets < 20KB gzipped.

## Embedding

Add this to the client site's `<head>`:

```html
<script>
  window.__ar_config = {
    ingestionUrl: 'https://ingest.trailscript.com',
    siteKey: 'sk_...'
  };
</script>
<script src="https://cdn.trailscript.com/tracker.min.js" async></script>
```

| Config Property | Required | Description |
|---|---|---|
| `ingestionUrl` | Yes | URL of the Ingestion API |
| `siteKey` | Yes | Site API key (from dashboard) |

The script exposes `window.__ar` with `start(config)`, `stop()`, and `emit(eventType, target, payload)` methods.

## Events Captured

- **click** — Button clicks, link clicks, any clickable element
- **fill** — Text input, textarea changes
- **select** / **check** — Select dropdowns, checkboxes, radio buttons
- **navigation** — Page loads, pushState/replaceState (SPA), popstate
- **keypress** — Enter/Escape/Tab and keyboard shortcuts
- **scroll** — Scroll position changes (debounced)
- **hover** — Meaningful hovers on interactive elements
- **drag-drop** — Drag and drop interactions
- **file-upload** — File input changes
- **dialog** — Alert, confirm, prompt, and custom dialogs
- **network** — Fetch/XHR requests (monkey-patched)

DOM checkpoints (rrweb-snapshot) are triggered on navigation, form submit, significant DOM mutations (>5 node changes), and session end.

See [docs/event-schema.md](../../docs/event-schema.md) for full schema details.

## Prerequisites

- Node.js 20+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev     # Rollup watch mode — rebuilds on change
npm run build   # Production minified build → dist/tracker.min.js
```

## Testing

```bash
npm test        # Playwright integration tests
```

Tests open `test/index.html` in a browser, intercept API calls to the ingestion endpoint, and validate event shapes and payloads. No running ingestion server is required — all API routes are intercepted by Playwright.

## Project Structure

```
services/tracker/
├── src/
│   ├── index.js                 Entry point, IIFE init, window.__ar
│   ├── events/                  One module per interaction type
│   │   ├── click.js
│   │   ├── fill.js
│   │   ├── select.js
│   │   ├── check.js
│   │   ├── navigate.js
│   │   ├── keypress.js
│   │   ├── scroll.js
│   │   ├── hover.js
│   │   ├── drag-drop.js
│   │   ├── file-upload.js
│   │   └── dialog.js
│   ├── selectors/extract.js     Multi-strategy selector extraction
│   ├── checkpoints/checkpoint.js DOM snapshot capture (rrweb-snapshot)
│   ├── session/session-manager.js Session ID + cross-tab sync
│   ├── transport/transport.js    Batched sendBeacon with fetch fallback
│   └── network/interceptor.js    Fetch/XHR monkey-patching
├── test/
│   ├── index.html               Test page with interactive elements
│   └── tracker.test.js          Playwright integration tests
├── dist/
│   └── tracker.min.js           Built output
├── rollup.config.js
└── package.json
```

## Notes

- IIFE format — exposes only `window.__ar`, no conflicts with host page globals
- Transport uses `sendBeacon` (primary) with `fetch` fallback and a retry queue capped at 50 batches
- Session ID persisted in `sessionStorage`, shared across same-origin tabs via `BroadcastChannel`
- Source maps are generated alongside the minified build
