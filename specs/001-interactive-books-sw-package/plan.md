# Implementation Plan: Interactive Books Service Worker Package Integration

**Branch**: `001-interactive-books-sw-package` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-interactive-books-sw-package/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace this app's hand-rolled service worker update-notification logic (the `Workbox`/`workbox-window` registration plus `BroadcastChannel("cr-message-channel")` `Activated`/`UpdateFound`/`confirm()` flow in [App.ts](../../../App.ts) and the premature `updatefound`-based broadcast in [sw-src.js](../../../sw-src.js)) with calls into the shared `@curiouslearning/sw` package, so this app gets the same "only announce an update once the new worker has actually claimed clients" fix already shipped for FTM and, per the sibling ticket, for Assessments. The package's peer dependencies require Workbox 7.x, so `workbox-*` packages here move from `^6.5.4`/CDN `importScripts` (6.2.0) to `^7.4.1`, and `sw-src.js` needs to become a bundled module (rather than a raw `importScripts`-only file) so it can `import` from `@curiouslearning/sw` and `workbox-*` npm packages. Both book pipelines this app uniquely carries (CR via `BookContent/`, GDL via `interactive-book-static/`) keep their existing app-specific caching/progress messages on the existing channel; only the generic update-lifecycle concern moves to the package.

## Technical Context

**Language/Version**: TypeScript 4.x → ES2017 (`tsconfig.json` `target: es2017`, `lib: es7/dom/webworker`), compiled per-file by `ts-loader` from the `App.ts` entry graph; `sw-src.js` is currently plain JS run unbundled.

**Primary Dependencies**: webpack 5 + `ts-loader` (build), `workbox-core`/`workbox-precaching`/`workbox-routing`/`workbox-strategies`/`workbox-expiration`/`workbox-window`/`workbox-cli` (currently `^6.5.4`, upgrading to `^7.4.1` to satisfy the new package's peer deps), `@splidejs/splide` (page carousel), `firebase` (analytics) — plus the new `@curiouslearning/sw@^1.0.0` (npm, public access) for update registration/notification and precache-manifest/injectManifest helpers.

**Storage**: Browser Cache Storage API (one named cache per book, keyed by `book.bookName`, populated by the service worker) + `localStorage` (per-book "cached" flag read by `App.ts` to decide whether to show the loading/progress UI). No server-side storage — this app has no backend.

**Testing**: No automated test suite/runner exists in this repo (`CLAUDE.md`: no lint, no test suite, `tsc --noEmit` is not a reliable signal here — `webpack` build success is the real correctness check). Verification for this feature is manual, per `quickstart.md`: local `npm run dev` build + Chrome DevTools Application/Network panel (offline simulation, SW update simulation) and, where feasible, the Android WebView container.

**Target Platform**: Browser (desktop + mobile, including WebView-embedded) with a native Android (and iOS) container shell that bridges via `window.Android.cachedStatus(...)` / `window.Android.setContainerAppOrientation(...)`; must keep working with no internet connection once a book is cached.

**Project Type**: Single static web app (no backend service) — build output (`dist/app.js`, `sw.js`) is committed directly and synced to S3 by CircleCI with no build step downstream (`CLAUDE.md`).

**Performance Goals**: No new performance targets; must not regress current caching throughput/UX (batched asset caching, ~5 files/batch with small inter-batch delay) or page-navigation responsiveness.

**Constraints**: Preserve both existing caching pipelines (CR `BookContent/` and GDL `interactive-book-static/`) and their existing `BroadcastChannel("cr-message-channel")` app-specific messages (`Cache` request → `CachingProgress` updates → 25/50/75/100% Firebase milestones → `localStorage` flag → `window.Android.cachedStatus`); built artifacts must be rebuilt and committed in the same change (no CI build step exists); offline-capable by definition of the feature.

**Scale/Scope**: One web app, two content-type pipelines (CR, GDL) sharing one service worker file and one message channel today; scope is limited to the update-lifecycle + shared-package adoption, not a caching-architecture rewrite (explicitly out of scope per the parent epic MR-167).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template (all `[PRINCIPLE_N_NAME]`/`[SECTION_N_NAME]` placeholders, no ratified version) — this project has not adopted a project constitution, so there are no gates to evaluate against. This check trivially passes; no complexity justification is required. (If a constitution is authored later, re-run this gate against it before implementation.)

**Post-Phase 1 re-check**: Research (workbox major-version bump, bundling `sw-src`, splitting the two `BroadcastChannel` protocols, delegating batch-caching to `cacheUrlsWithProgress`) and design (data-model.md, contracts/broadcast-channel.md) introduced no new services, repositories, or cross-project dependencies beyond what's already in this single static web app — still no gates apply, still no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-interactive-books-sw-package/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
App.ts                    # Client entry point; registerServiceWorker() moves onto @curiouslearning/sw's
                           # registerServiceWorkerUpdates() for the update-lifecycle piece, keeps its own
                           # "Cache"/"CachingProgress" handling on the existing BroadcastChannel
sw-src.ts                  # (renamed from sw-src.js) Service worker source; imports workbox-precaching v7 and
                           # @curiouslearning/sw (registerUpdateNotifier, cacheUrlsWithProgress) instead of the
                           # CDN importScripts; built through webpack via the InjectManifest plugin's child
                           # compilation, so it can resolve npm imports and run through ts-loader like App.ts
sw.js                      # BUILD OUTPUT of webpack's InjectManifest plugin (workbox-webpack-plugin) processing
                           # sw-src.ts — committed artifact, must be regenerated in this change
dist/app.js                # BUILD OUTPUT of `webpack` against App.ts — committed artifact, must be regenerated
webpack.config.js          # Gains an InjectManifest plugin (workbox-webpack-plugin), configured via
                           # @curiouslearning/sw's createInjectManifestOptions(), replacing the standalone
                           # `npx workbox injectManifest` CLI step
workbox-config.js          # REMOVED — its swSrc/swDest/globDirectory/globPatterns/globIgnores settings move
                           # into the InjectManifest plugin config in webpack.config.js
package.json                # workbox-* bumped ^6.5.4 → ^7.4.1; workbox-webpack-plugin added; workbox-cli and the
                           # separate `injectManifest` npm script removed; @curiouslearning/sw added
src/Books/GdlBookRuntime.ts # GDL caching trigger — message payload/shape unchanged, verified against new flow
```

**Structure Decision**: Single static web app, no new top-level directories. This is a targeted swap of the
service-worker registration/update layer plus the webpack/workbox build wiring needed to let `sw-src.js`
consume npm packages; the two content-pipeline modules (`src/Books/*`, `src/Parser/*`, `src/PlayBackEngine/*`)
are unaffected beyond verifying their existing caching trigger still round-trips correctly.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution is adopted for this project (see Constitution Check above), and no violations were identified — this section is intentionally empty.
