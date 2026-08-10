# Contract: BroadcastChannel Messages

This app has no HTTP/API surface (no backend). Its external interface is the pair of `BroadcastChannel`
protocols between the page (`App.ts` / `GdlBookRuntime.ts`) and the service worker (`sw-src.js` /
`@curiouslearning/sw`). This document is the contract for both, post-integration.

## Channel 1: `"cr-message-channel"` (app-owned, unchanged shapes)

| Direction | `command` | `data` shape | Trigger / Effect |
|---|---|---|---|
| App → SW | `"Cache"` | `{ lang, bookData: Book, contentFile: string }` (CR) or `{ type: "gdl", bookName/gdlId, basePath, contentFile }` (GDL) | Sent once on init if `localStorage.getItem(book.bookName) == null`, and again on receiving `"Activated"`. Triggers `cacheTheBookJSONAndImages()` or `cacheGdlBookAssets()` in the worker. |
| SW → App | `"Activated"` | `{}` | Sent from the worker's `activate` listener. `App.ts` responds by re-sending `"Cache"` (handles the case where the page loaded before the worker activated). |
| SW → App | `"CachingProgress"` | `{ progress: number, bookName: string }` | Sent per batch while caching. Drives `#progressBar`, the 25/50/75/100 Firebase milestones, and — at 100 — the `localStorage` write and `window.Android.cachedStatus()` call. |

**Compatibility requirement**: These three messages, their `command` strings, and their `data` field names
MUST NOT change as part of this feature — `App.ts`'s `handleLoadingMessage` and `GdlBookRuntime.ts`'s trigger
depend on them exactly as-is. Only *how* `CachingProgress` values are produced inside the worker may change
(via `cacheUrlsWithProgress()` — see [research.md](../research.md) §4).

## Channel 2: `@curiouslearning/sw` update-lifecycle channel (package-owned, new)

Configuration surface only — the app does not construct these messages itself, it configures the package's
registration calls and reacts to a callback:

| Side | Call | Key options this app supplies | Effect |
|---|---|---|---|
| Service worker (`sw-src.ts`) | `registerUpdateNotifier(options?)` | Default channel name (`'sw-update-channel'` — do not point at `"cr-message-channel"`, see [research.md](../research.md) §3); called synchronously at top level after precaching setup | Broadcasts update-ready only once the new worker has claimed clients. |
| App (`App.ts`) | `registerServiceWorkerUpdates(options)` | `swUrl: "/sw.js"`; default `mode: "confirm"` (matching default channel name as the worker side) | Replaces the current `UpdateFound` broadcast + `handleUpdateFoundMessage()` confirm-dialog flow in `App.ts`. Per the package's README, `'confirm'` mode already reproduces this app's existing confirm-and-reload UX, so no custom callback is required. |

**Compatibility requirement**: The user-visible behavior of `handleUpdateFoundMessage()` today — a blocking
`confirm()` prompt, reload on accept, "update on next launch" on decline — is the behavior FR-002 requires be
preserved. Whichever `mode` is chosen, the resulting UX must match this, not introduce new UX.

## Out of scope for this contract

- Any HTTP endpoints — this app has none; content is static files served/cached, not an API.
- The GDL `content.json` / CR `content.json` schemas — unrelated to the service worker contract, untouched by
  this feature.
