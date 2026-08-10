# Phase 1 Data Model: Interactive Books Service Worker Package Integration

This feature has no persistent/relational data model — it's a client-side caching/messaging change. The "entities"
below are the in-memory/browser-storage shapes that flow between `App.ts`, `sw-src.js`, and `@curiouslearning/sw`.

## Cached Book Record

Represents whether a given book's assets have finished downloading into the browser's Cache Storage.

| Field | Type | Notes |
|---|---|---|
| `bookName` | string | Key into both `localStorage` (`localStorage.getItem(bookName)`) and Cache Storage (`caches.open(bookName)`); for GDL books this is `data.bookName \|\| data.gdlId`. |
| `cached` | boolean | Derived, not stored directly — `localStorage.getItem(bookName) !== null`. |
| `bookType` | `"cr" \| "gdl"` | Determined in `sw-src.js` from `data.type === "gdl"` or `data.bookName.startsWith("gdl-")`; routes to `cacheTheBookJSONAndImages()` vs `cacheGdlBookAssets()`. No change in this feature. |

**Validation / lifecycle**: Written only after `CachingProgress` reaches 100% (`App.ts`'s `handleLoadingMessage`). Unaffected by this feature except that the 100%-completion signal may now be produced by `cacheUrlsWithProgress()`'s progress callback instead of the hand-rolled batch loop (see [research.md](./research.md) §4) — the `localStorage` write itself is unchanged.

## Service Worker Update State

Represents whether a newer service worker version exists and whether it has taken control.

| Field | Type | Notes |
|---|---|---|
| `installing` | boolean | New worker installed but not yet active — internal to the browser/`@curiouslearning/sw`, not currently surfaced to `App.ts`. |
| `waitingForActivation` | boolean | New worker installed and waiting; today this is (incorrectly, per the bug being fixed) when `sw-src.js`'s `updatefound` listener fires the `UpdateFound` broadcast. |
| `activated` | boolean | New worker has called `clients.claim()` and is now controlling the page — `@curiouslearning/sw`'s `registerUpdateNotifier()` only broadcasts readiness at this point, which is the corrected behavior this feature adopts. |

**State transition (target behavior)**: `installing → waitingForActivation → activated`, with the app-visible "update available" notification firing only on the `activated` transition (via the package's own channel, not `"cr-message-channel"` — see [research.md](./research.md) §3). This replaces the current `installing/waitingForActivation → notify` behavior that causes the stale-content bug described in FR-001/SC-003.

## Caching Progress Event

The message shape carrying percent-complete from the service worker to the app during a book download.

| Field | Type | Notes |
|---|---|---|
| `command` | `"CachingProgress"` | Unchanged — still posted on `"cr-message-channel"`. |
| `data.progress` | number (0–100) | Rounded percentage of assets processed so far; drives `#progressBar` width and the 25/50/75/100 Firebase milestone checks in `App.ts`'s `handleLoadingMessage`. |
| `data.bookName` | string | Passed through to the Firebase payload and the `localStorage`/Android-bridge completion step at 100%. |

**Validation**: Must still reach exactly 100 once (not skip past it) so the existing `logged100PercentDownload` guard and `readLanguageDataFromCacheAndNotifyAndroidApp()` call fire exactly once per caching run — this is a behavioral constraint on whatever `onProgress` callback wraps `cacheUrlsWithProgress()`, not a new field.

## Message Channel Contracts

Two separate `BroadcastChannel` protocols coexist after this change (see [research.md](./research.md) §3 and
[contracts/broadcast-channel.md](./contracts/broadcast-channel.md) for the full message shapes):

1. **`"cr-message-channel"` (existing, app-owned)** — `Cache` (app → SW, book-specific caching request), `Activated` (SW → app, SW lifecycle bootstrap used only to retry the `Cache` request), `CachingProgress` (SW → app). Unchanged by this feature.
2. **`@curiouslearning/sw`'s update channel (new, package-owned)** — generic update-lifecycle handshake (`registerUpdateNotifier()` in the worker, `registerServiceWorkerUpdates()` in the app), replacing the app's current `UpdateFound` message + `confirm()` dialog. Channel name/message shapes are whatever the package defines internally; this app only needs to supply `swUrl` and a `mode`/`onUpdateAvailable` callback that reproduces the existing confirm-and-reload UX (FR-002).
