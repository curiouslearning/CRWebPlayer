# Quickstart: Validating the Service Worker Package Integration

No automated test suite exists in this repo (see `CLAUDE.md`); validate manually against the acceptance
scenarios in [spec.md](./spec.md) using a local build.

## Prerequisites

- Node.js + npm installed, repo dependencies installed (`npm install`).
- `@curiouslearning/sw` and the upgraded `workbox-*@^7.4.1` packages installed (part of this feature's
  implementation, not a prerequisite to add yourself).
- A CR book (default: `LetsFlyLevel2En`) and a GDL book (any `gdl-` prefixed id present under
  `interactive-book-static/`) available locally to test both pipelines per User Story 3.

## Build & serve locally

```bash
npm run dev   # webpack && npx workbox injectManifest && live-server --no-browser
```

This rebuilds `dist/app.js`, regenerates `sw.js` from the (now bundled) service worker entry, and serves the
repo root so the service worker can register against real paths.

## Scenario 1 — First load caches a book, with correct progress reporting (supports SC-004)

1. Open the app fresh (clear Application → Storage in DevTools first, or use a new profile) at
   `?book=LetsFlyLevel2En`.
2. In DevTools → Application → Service Workers, confirm a worker registers and activates.
3. Watch the on-screen progress bar reach 100% and disappear.
4. In the Network/console, confirm the 25/50/75/100 `download_*` Firebase events fire once each, in order,
   only once.
5. Confirm `localStorage.getItem("LetsFlyLevel2En")` is now `"true"`.

**Repeat for a `gdl-` book** (User Story 3) — same expectations, routed through the GDL caching path.

## Scenario 2 — Offline playback of a cached book (User Story 2, SC-002)

1. With a book already cached (Scenario 1 complete), DevTools → Network → set to **Offline**.
2. Reload the page with the same `?book=` query param.
3. Confirm the book loads and every page/audio/image asset renders with no failed network requests in the
   Network panel.
4. Repeat for the GDL book.

## Scenario 3 — Update delivery is not premature (User Story 1, SC-001, SC-003)

1. With a book already cached and the app open, go **online**, change something cacheable (e.g. bump the
   `workbox-config.js`-driven precache revision by touching a precached file, or change `sw-src`'s version
   constant), then rebuild (`npm run dev`) so a new `sw.js` is served.
2. Reload the tab (or wait for the browser's periodic SW update check).
3. Confirm the "update available" prompt appears **only after** DevTools → Application → Service Workers shows
   the new worker as `activated`/controlling the page — not while it's merely `installed`/`waiting`.
4. Accept the prompt; confirm the page reloads and now serves the changed content (not the previous version).
5. Repeat the scenario but **decline** the prompt; confirm the app keeps working normally on the old version
   until the next natural reload.

## Scenario 4 — First-ever launch, no cache, no service worker yet

1. Fully clear site data.
2. Load the app for the first time. Confirm it doesn't error out waiting on any update/caching message that
   never arrives, and that Scenario 1 still completes normally from this cold state.

## Regression checks specific to this repo

- Repeat Scenarios 1–3 for **both** a CR book and a GDL book — this app is the only sibling integration
  carrying two content pipelines through one service worker (User Story 3).
- If a device/emulator with the Android container is available, confirm `window.Android.cachedStatus(true)`
  is still invoked after Scenario 1 completes.
