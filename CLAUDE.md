# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Curious Reader Web Player: a TypeScript/webpack web app that plays back **Curious Reader H5P** interactive books and **Digital Library (GDL)** books, embedded in a native container app (Android/iOS) or opened directly in a browser. There is no backend — content is static JSON + media served from `BookContent/` (CR books) or `interactive-book-static/` (GDL books), and offline caching is handled entirely by a service worker.

## Commands

```bash
webpack                 # Build App.ts + src/** into dist/app.js (production mode by default)
npx workbox injectManifest   # Regenerate sw.js precache manifest from sw-src.js after a build
live-server              # Serve the repo root (emulates a backend for local dev)
npm run dev               # webpack && injectManifest && live-server, in one shot
```

There is no test suite, linter, or `npm run build`/`npm start` script defined in `package.json` — use the raw commands above. `npx tsc --noEmit` currently fails on unrelated `lib.dom`/`lib.webworker` duplicate-definition errors from `tsconfig.json`'s `"lib": ["es7", "dom", "webworker"]`; use `webpack` (which runs `ts-loader` per compiled file) as the real correctness check instead.

**Build artifacts are committed.** `dist/app.js` and `sw.js` are checked into git (not gitignored) and must be rebuilt and included in the same commit as any `src/`/`App.ts` change — CI does not build anything, see below.

## Deployment

CircleCI (`.circleci/config.yml`) does **not** run a build or tests. It syncs the entire repo tree straight to S3 (excluding `.git*`) whenever `develop`, `main`, or `Partner` is updated:
- `develop` → `s3://curious-reader-books-development`
- `main` → `s3://curious-reader-books-production`
- `Partner` → `s3://partners-content-development` (see `PARTNER_CONTENT_GUIDELINES.md` for the partner-content workflow, which is a separate track from core app development)

This is why the built `dist/app.js`/`sw.js` must already be correct in the commit — there's no build step downstream.

## Architecture

### Entry flow

`App.ts` reads `?book=` from the URL (defaults to `LetsFlyLevel2En`) and picks a loader via `createBookLoader()` in `src/Books/BookLoader.ts`:
- Names starting with `gdl-` → `GdlBookLoader` → `src/Books/GdlBookRuntime.ts`, which dynamically injects a `gdl-player` web component (CSS/UMD JS loaded from `interactive-book-static/<id>/`) rather than using the internal renderer.
- Everything else → `CrBookLoader`, which constructs an `App` pointed at `BookContent/<bookName>/content/content.json` (+ `images/`, `audios/`) and drives it through `ContentParser` → `PlayBackEngine`.

### CR book pipeline (`src/Parser/ContentParser.ts` → `src/PlayBackEngine/PlayBackEngine.ts`)

1. `ContentParser.parseBook()` fetches `content.json`, detects book type from its shape (`presentation` key = CuriousReader, `chapters` key = GDL), and walks each slide/page's element list into typed models (`src/Models/*.ts`): `TextElement`, `ImageElement`, `AudioElement` (which nests `AudioTimestamps` → `WordTimestampElement[]`, one entry per word with `startTimestamp`/`endTimestamp`/`domID`/`audioSrc`, parsed from the H5P `timeStampForEachText` field).
2. `PlayBackEngine.initializeBook()` builds the whole book as Splide (`@splidejs/splide`) slides up front — one `<li class="splide__slide">` per page, with absolutely-positioned text/image/audio divs sized as `%` of the slide (positions/sizes come straight from the H5P layout data). Each spoken word becomes its own `<div id="{audioDomID}_word_{i}" class="cr-clickable-word">` so it can be targeted individually for highlighting/clicking.
3. Page audio playback and the karaoke-style word highlighting (matching `audioElementDom.currentTime` against each word's timestamp window on a 60ms interval) live in `playPageAudio`/`stopPageAudio`/`resolveCurrentWordIndex` in `PlayBackEngine.ts` — this is the most actively-iterated part of the codebase (see `docs/word-highlight-stuck-state-fix.md` for a recent bug writeup covering how overlapping timestamp windows could leave a word's highlight stuck). Manual word-click playback and connected "glow image" highlighting (illustrations tied to specific words via a `img{audioDomID}_{wordIndex}` CSS class) go through the separate `handleInteractiveWordClick` / `enableConnectedGraphicHighlighting` path, which is timeout-driven (600ms) rather than tied to the audio-time interval.
4. Page navigation is driven by Splide's `move`/`moved`/`drag`/`dragged` events, which call `stopPageAudio`/`playPageAudio` on the outgoing/incoming page respectively.

### Offline caching contract

Caching is coordinated over a single `BroadcastChannel("cr-message-channel")` shared between `App.ts` (and `GdlBookRuntime.ts` for GDL) and the service worker (`sw-src.js`, built to `sw.js` via `workbox injectManifest`):
- App → SW: `{ command: "Cache", data: { bookData / gdlId, contentFile, basePath... } }` once the SW is `ready` and the book isn't already in `localStorage`.
- SW → App: `{ command: "Activated" }` on SW activation (triggers a re-send of the cache request), `{ command: "CachingProgress", data: { progress } }` as assets download (drives `#progressBar` and Firebase download-progress milestones at 25/50/75/100%), `{ command: "UpdateFound" }` when a new SW version is waiting (prompts the user via `confirm()` to reload).
- Once caching hits 100%, the book name is written to `localStorage` and, if running inside the Android container (`window.Android` bridge present), `window.Android.cachedStatus(...)` is called.

### Other notable pieces

- `src/common/global-properties.ts` reads `cr_user_id`, `source`, `campaign_id` query params once at module load — these feed every Firebase event.
- `src/Analytics/Firebase/FirebaseManager.ts` is a singleton (`FirebaseAnalyticsManager.getInstance()`) wrapping `firebase/analytics`; failures are caught and logged, never thrown.
- Several `book.bookName.includes("...")` special-case branches exist in `PlayBackEngine.ts` (text/image positioning) to work around layout issues in specific partner books, marked `TODO: remove after partner fixes` — don't generalize these, they're intentionally narrow patches.
- `tsconfig.json`'s `include` only lists `Models`, `Parser`, `src/PlayBackEngine` (not `src/Books`, `src/Analytics`, `src/common`) — this looks stale/inconsistent but webpack's `ts-loader` compiles per-file from the `App.ts` entry graph regardless, so it hasn't broken the build. Be aware `tsc --noEmit -p .` is not a reliable signal for this repo.
