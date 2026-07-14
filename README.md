# trailscript-tracker [![CI](https://github.com/nachee/trailscript-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/nachee/trailscript-tracker/actions/workflows/ci.yml)

A lightweight (**6.2 KB gzipped**, zero-config) vanilla-JS tracker that records what real users
actually *do* on a page — clicks, fills, navigations, selective DOM snapshots — and emits them as
structured events that downstream tooling can turn into end-to-end tests.

This is the browser half of **TrailScript**, an automated E2E-test-generation product. The events it
emits conform to a shared contract ([`trailscript-event-schema`](https://github.com/nachee/trailscript-event-schema))
and are consumed by the analysis-and-codegen engine
([`trailscript-testgen`](https://github.com/nachee/trailscript-testgen)), which turns recorded
journeys into runnable Playwright specs.

## Why it's interesting

**Capturing *that* a user clicked is easy. Capturing it so a test can reliably click it again six
months later is the hard part.** That's most of what this tracker is.

- **Multi-strategy, ranked selector extraction.** A recorded click is worthless if the selector
  rots. So every element is captured through *seven simultaneous strategies* at once — ARIA role +
  accessible name, `data-testid`, visible text, placeholder, CSS, XPath, and positional `nth` —
  and the generator downstream picks the most stable one available, degrading gracefully when a
  page doesn't offer good hooks (`src/selectors/extract.js`). Accessible-name resolution follows
  the real precedence chain (`aria-label` → `aria-labelledby` → `<label for>` → wrapping `<label>`
  → text content), with implicit ARIA roles derived per tag, so the resulting locators look like
  the ones a human would have written.

- **PII minimisation at capture time, in three layers.** Recording real users means routinely
  brushing against real personal data, so nothing sensitive is meant to leave the browser raw:
  free-text input values are swapped for type-appropriate **synthetic** placeholders
  (`src/normalisation/synthetic.js`); captured page text — which *can't* simply be dropped, since
  it drives `getByText()` locators — is swept for emails, phone numbers, card-like digit runs and
  opaque tokens (`src/normalisation/redact.js`); and query strings are stripped from intercepted
  network URLs. Constrained inputs (`select`, checkbox, radio) deliberately keep their real values,
  because those *branch the flow*. It's best-effort pattern scrubbing, not a proof of zero leakage —
  and the code says so.

- **A transport designed around the page dying mid-flow.** The most interesting events happen right
  before someone navigates away, so delivery uses `sendBeacon` as the primary path (it survives
  unload), with a `keepalive` `fetch` fallback and a bounded retry queue. A neat consequence:
  `sendBeacon` *cannot set custom headers*, so on that path the site key rides in the request body
  instead of `X-Site-Key` — the kind of detail that only shows up once you actually ship it.

- **Selective DOM checkpoints, not full session replay.** Rather than recording everything (heavy,
  privacy-hostile), `rrweb-snapshot` fires only at moments that make good **assertions**:
  navigation, form submit, a significant DOM mutation (>5 nodes), and a debounced "click-settle"
  after a click that didn't navigate. That's what gives the generated tests something to assert
  *against*.

## Embedding

> **Note:** the URLs below are **illustrative** — `cdn.trailscript.com` / `ingest.trailscript.com`
> are not public endpoints. Point them at your own build of `dist/tracker.min.js` and your own
> ingestion API.

```html
<script>
  window.__trailscript_config = {
    ingestionUrl: 'https://your-ingestion-api.example.com',
    siteKey: 'sk_...'
  };
</script>
<script src="/path/to/tracker.min.js" async></script>
```

| Config property | Required | Description |
|---|---|---|
| `ingestionUrl` | Yes | Base URL of the ingestion API |
| `siteKey` | Yes | Per-site API key |

The tracker auto-starts when `window.__trailscript_config` is present. It exposes a single global,
`window.__trailscript`, with `start(config)`, `stop()`, and `emit(eventType, target, payload)`.

## Events captured

| Event | Trigger |
|---|---|
| `click` | Buttons, links, any clickable element |
| `fill` | Text input / textarea changes (value synthesised) |
| `select` / `check` | Dropdowns, checkboxes, radios (real values kept — they branch the flow) |
| `navigation` | Page load, `pushState`/`replaceState` (SPA), `popstate` |
| `keypress` | Enter/Escape/Tab and keyboard shortcuts |
| `scroll` | Scroll position (debounced) |
| `hover` | Meaningful hovers on interactive elements |
| `drag-drop` | Drag and drop |
| `file-upload` | File input changes |
| `dialog` | `alert` / `confirm` / `prompt` and custom dialogs |
| `network` | `fetch` / XHR (monkey-patched; query strings stripped) |

Event and checkpoint payloads are defined by
[`trailscript-event-schema`](https://github.com/nachee/trailscript-event-schema) — one Zod source of
truth, compiled to JSON Schema and Pydantic so the JS tracker and the Python analysis service
validate against the exact same contract.

## Setup

Requires Node 20+.

```bash
npm install
npm run build     # production minified build → dist/tracker.min.js
npm run dev       # rollup watch mode
```

## Tests

```bash
npx playwright install chromium   # first run only
npm test                          # 29 passing
```

Playwright opens `test/index.html` in a real browser, intercepts the ingestion API routes, and
validates the emitted event shapes — no ingestion server required. The redaction logic is pure
string manipulation, so it's unit-tested directly (`test/redact.test.js`).

## Layout

```
src/
├── index.js                      entry point, IIFE init, window.__trailscript
├── selectors/extract.js          multi-strategy ranked selector extraction
├── normalisation/
│   ├── synthetic.js              synthetic replacement of free-text input values
│   └── redact.js                 PII-pattern redaction of captured text
├── events/                       one module per interaction type
│   ├── click.js  fill.js  select.js  check.js  navigate.js  keypress.js
│   └── scroll.js  hover.js  drag-drop.js  file-upload.js  dialog.js
├── checkpoints/checkpoint.js     selective DOM snapshots (rrweb-snapshot)
├── session/session-manager.js    session id + cross-tab sync (BroadcastChannel)
├── transport/transport.js        batched sendBeacon w/ fetch fallback + retry queue
└── network/interceptor.js        fetch/XHR monkey-patching
test/
├── index.html                    test page with interactive elements
├── tracker.test.js               Playwright integration tests
└── redact.test.js                redaction unit tests
```

## Notes

- IIFE build — exposes only `window.__trailscript`, so it won't collide with host-page globals.
- Session id persisted in `sessionStorage`, shared across same-origin tabs via `BroadcastChannel`.
- Retry queue is capped (50 batches) so a dead ingestion endpoint can't grow unbounded in memory.
- Source maps are emitted alongside the minified build.

## License

MIT — see [LICENSE](LICENSE).
