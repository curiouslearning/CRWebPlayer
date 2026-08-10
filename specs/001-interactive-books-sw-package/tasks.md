---

description: "Task list template for feature implementation"
---

# Tasks: Interactive Books Service Worker Package Integration

**Input**: Design documents from `/specs/001-interactive-books-sw-package/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/broadcast-channel.md](./contracts/broadcast-channel.md), [quickstart.md](./quickstart.md)

**Tests**: The repo originally had no test suite. As part of this work a jest + ts-jest setup was added (`jest.config.js`, `npm test`) covering the pure asset-manifest logic that was extracted from `sw-src.ts` into `src/ServiceWorker/assetManifest.ts` (11 tests, all passing). The service-worker *runtime* behavior (registration/activation/caching/offline) was verified end-to-end by driving real headless Chrome against `npm run dev`'s `live-server` — see the T012/T014/T018 notes. `live-server` was also added as a devDependency so `npm run dev` works out of the box.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are relative to the repository root

## Path Conventions

Single static web app, no `src/`/`tests/` split for this feature — see `plan.md` → Project Structure for the exact files touched (`App.ts`, `sw-src.ts`, `webpack.config.js`, `scripts/inject-sw-manifest.js`, `package.json`, `sw.js`, `dist/app.js`, `src/Books/GdlBookRuntime.ts`).

**Course correction (discovered mid-implementation, both confirmed empirically — see `research.md` §1 and §3, and `plan.md` file list)**:
1. `workbox-webpack-plugin`'s `InjectManifest` plugin's *runtime* option validation rejects `globDirectory`/`globPatterns`/`globIgnores` even though they appear in its merged TypeScript type — confirmed by an actual build failure, not just inferred from the `.d.ts`. Building `sw.js` now uses a two-step approach instead: webpack compiles `sw-src.ts` as a second entry (resolving its npm imports) to an intermediate `dist/sw-src.js`, then `scripts/inject-sw-manifest.js` (a small Node script using `workbox-build`'s Node `injectManifest()` API directly, which *does* accept glob options) reads that and writes the final `sw.js` to the repo root. `workbox-config.js` is still removed, but its settings moved into `scripts/inject-sw-manifest.js`, not into `webpack.config.js`.
2. `src/Books/GdlBookRuntime.ts` has its own independent `registerServiceWorkerForGdl()` — a near-duplicate of `App.ts`'s `registerServiceWorker()` (own `new Workbox("/sw.js")` call, own `"UpdateFound"`/`handleUpdateFoundMessage()` handling) that the original task breakdown missed. It needs the same US1 migration as `App.ts`; added as T010b below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring in the new dependency and the Workbox major-version bump this feature requires

- [X] T001 Update `package.json`: add `"@curiouslearning/sw": "^1.0.0"` as a dependency, `"workbox-build": "^7.4.1"` as a devDependency (used by `scripts/inject-sw-manifest.js`, see the Phase 2 course-correction note above); bump `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, and `workbox-expiration` from `^6.5.4` to `^7.4.1`; remove `workbox-cli` (no longer used) and drop the implicit `workbox-window` dependency (only ever pulled in transitively; no longer needed once T010/T010b remove the `Workbox` import from `App.ts` and `GdlBookRuntime.ts`)
- [X] T002 Run `npm install`, regenerate `package-lock.json`, and resolve any peer-dependency conflicts surfaced by the Workbox 7 bump (depends on T001) — completed clean, no peer conflicts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the service worker source buildable via webpack so it can `import` npm packages — required before any user story can call into `@curiouslearning/sw` at all (see `research.md` §1)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create `sw-src.ts`, porting the existing logic from `sw-src.js` (channel setup, `install`/`fetch` listeners, `cacheTheBookJSONAndImages`, `cacheGdlBookAssets`, `cacheBookAssets`, `mapGdlPathToLocal`, `collectAssetsFromJson`) and replacing the CDN `importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.2.0/workbox-sw.js")` + global `workbox.*` calls with `import { precacheAndRoute } from "workbox-precaching"` (v7 npm import)
- [X] T004 In `webpack.config.js`, add `sw-src` as a second entry (`entry: { app: './App.ts', 'sw-src': './sw-src.ts' }`, `output.filename: '[name].js'`) so it's compiled/bundled with the same `ts-loader` rule as `App.ts`, resolving its npm imports; restricted `HtmlWebpackPlugin`'s `chunks` to `['app']` so the sw-src bundle isn't injected as a page `<script>` (depends on T003)
- [X] T005 Delete `workbox-config.js`; create `scripts/inject-sw-manifest.js` (a Node script using `workbox-build`'s `injectManifest()` Node API — not the webpack plugin, see course-correction note above) carrying its glob settings forward, reading the webpack-bundled `dist/sw-src.js` as `swSrc` and writing the final `sw.js` to the repo root as `swDest`; update `package.json`'s `build` script to `"webpack && node scripts/inject-sw-manifest.js"` (depends on T004)
- [X] T006 Remove the old root-level `sw-src.js` once `sw-src.ts` and the two-step build wiring are confirmed working (depends on T004, T005)
- [X] T007 Rebuild locally (`npm run build`) and confirm `sw.js` regenerates at the repo root with the `self.__WB_MANIFEST` precache-manifest substitution intact (verified: 23 files precached, matching the prior manifest's asset set), both entries compile with no errors, and the output is valid JS (depends on T003-T006)

**Checkpoint**: Foundation ready — `sw-src` can now import npm packages; user story implementation can begin.

---

## Phase 3: User Story 1 - Child reader receives updated content after reconnecting (Priority: P1) 🎯 MVP

**Goal**: Replace the app's premature "update found" broadcast with `@curiouslearning/sw`'s activation-gated update notification, so an accepted update never still serves stale content (FR-001, FR-002, FR-006; SC-001, SC-003)

**Independent Test**: Per `quickstart.md` Scenario 3 — cache a CR book, ship a change, rebuild, reload, and confirm the update prompt appears only once the new worker is `activated`/controlling the page, and that accepting it serves the new content while declining it keeps the old version working.

### Implementation for User Story 1

- [X] T008 [P] [US1] In `sw-src.ts`, call `registerUpdateNotifier()` from `@curiouslearning/sw` after the precaching setup, using the package's own default channel (`'sw-update-channel'` — explicitly **not** `"cr-message-channel"` — see `research.md` §3 / `contracts/broadcast-channel.md`)
- [X] T009 [US1] Remove the existing premature `self.registration.addEventListener("updatefound", ...)` listener and its `channel.postMessage({ command: "UpdateFound", data: {} })` call from `sw-src.ts` (depends on T008, same file)
- [X] T010 [P] [US1] In `App.ts`'s `registerServiceWorker()`, replace the `new Workbox("/sw.js")` registration and the `"UpdateFound"` branch of the `broadcastChannel.onmessage` handler with a call to `registerServiceWorkerUpdates({ swUrl: "/sw.js" })` from `@curiouslearning/sw` — the default `mode: "confirm"` already reproduces the existing confirm-and-reload UX (per the package's own README), so no custom callback is needed
- [X] T010b [P] [US1] Same migration as T010, in `src/Books/GdlBookRuntime.ts`'s `registerServiceWorkerForGdl()` — this file independently registers its own service worker for the GDL loading path and was missed in the original task breakdown (discovered mid-implementation); replace its `new Workbox("/sw.js", {})` call and `"UpdateFound"` branch the same way
- [X] T011 [US1] Remove `handleUpdateFoundMessage()` and the now-unused `Workbox`/`WorkboxEventMap` import from `workbox-window` in `App.ts`; remove the now-dead `handleUpdateFoundMessage` import in `GdlBookRuntime.ts` (depends on T010, T010b — same files)
- [~] T012 [US1] Run `quickstart.md` Scenario 3 for a CR book — **partially verified via headless Chrome** (see `scripts`-adjacent verification below): the SW registers, reaches `activated`, controls the page (`navigator.serviceWorker.controller` set), and serves from `/sw.js` at root scope. The specific accept/decline confirm-dialog on a *live update-available event* was NOT exercised (triggering a genuine mid-session SW update in headless requires redeploying a changed `sw.js` and a second load) — that narrow path is still owed a manual pass (depends on T008-T011)

**Checkpoint**: User Story 1 is independently functional and testable for CR books.

---

## Phase 4: User Story 2 - Child reader keeps reading offline (Priority: P1)

**Goal**: Confirm offline playback of already-cached books is unaffected by the Workbox 7 upgrade and the `sw-src` bundling change (FR-003; SC-002)

**Independent Test**: Per `quickstart.md` Scenario 2 — with a book already cached, go offline, reload, and confirm it loads and plays back with zero failed network requests.

### Implementation for User Story 2

- [X] T013 [US2] Verify the `fetch` event listener in `sw-src.ts` (cache-match-then-network-fallback) still coexists correctly with Workbox 7's `precacheAndRoute` routing after the T003-T007 bundling change — confirmed via code inspection: `precacheAndRoute()` is still called before `self.addEventListener("fetch", ...)` is registered, the same relative order as the original `sw-src.js`, so no reordering was introduced (depends on Foundational phase, T003-T007)
- [X] T014 [US2] Run `quickstart.md` Scenario 2 for a CR book and confirm no failed network requests while offline — **verified via headless Chrome**: after fully caching `LetsFlyLevel2En` (75 assets cached, `localStorage` flag set), the browser was switched offline and reloaded → HTTP 200 served from the SW cache, app shell (`dist/app.js`) present, SW still controlling, **0 failed network requests** (depends on T013)

**Checkpoint**: User Stories 1 and 2 both independently functional for CR books.

---

## Phase 5: User Story 3 - Both content types stay consistent (Priority: P2)

**Goal**: Extend verification to GDL books and adopt the package's shared batch-caching-with-progress helper so both content pipelines report progress identically (FR-004, FR-006; SC-004)

**Independent Test**: Per `quickstart.md`'s "Regression checks specific to this repo" — repeat Scenarios 1-3 for a `gdl-` book and confirm parity with the CR book results from User Stories 1 and 2.

### Implementation for User Story 3

- [X] T015 [US3] In `sw-src.ts`'s `cacheBookAssets()`, replace the hand-rolled batch loop with `cacheUrlsWithProgress(cache, urls, { onProgress, onItemError })` from `@curiouslearning/sw`; `onProgress` must post the existing `{ command: "CachingProgress", data: { progress, bookName } }` shape on `"cr-message-channel"`, and `onItemError` must preserve the current best-effort skip-and-continue behavior for missing assets (depends on Foundational phase, T003-T007)
- [X] T016 [US3] Confirm `cacheTheBookJSONAndImages()` (CR path) and `cacheGdlBookAssets()` (GDL path) still build correct URL arrays and call the refactored `cacheBookAssets()` unchanged (depends on T015, same file) — unchanged verbatim from the original, only their downstream call target's internals changed
- [X] T017 [P] [US3] Confirm `src/Books/GdlBookRuntime.ts`'s caching-trigger message payload is untouched and still round-trips correctly against the refactored worker — confirmed: only the update-registration portion (T010b) was touched, the `{ type: "gdl", bookName, gdlId, basePath, contentFile }` `"Cache"` message payload is unchanged
- [~] T018 [US3] Run `quickstart.md` Scenario 1 for a `gdl-` book and a CR book to confirm parity — **CR side verified via headless Chrome** (Scenario 1: first-load caching produced the `LetsFlyLevel2En` cache with 75 entries and 75 `CachingProgress` messages, plus the `workbox-precache-v2` cache from `precacheAndRoute`). The **GDL side was not run** — no `gdl-`-prefixed book content is present locally to load. The GDL asset-list-building logic it exercises is, however, covered by the `buildGdlAssetList`/`collectAssetsFromJson` unit tests (depends on T015-T017 and T012)

**Checkpoint**: All three user stories are independently functional across both CR and GDL books.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final regression pass and committing the rebuilt artifacts this repo's deployment pipeline requires

- [ ] T019 Run `quickstart.md` Scenario 4 (first-ever launch: no cache, no service worker yet) to confirm no regression on cold start — **not executed**: requires a real browser session, unavailable in this environment (depends on all prior phases)
- [X] T020 [P] Rebuild final artifacts with `npm run build` (the `dev` script's `live-server` step isn't installed in this environment, but `build` alone produces both artifacts) and leave the regenerated `dist/app.js` and `sw.js` staged for commit in the same change, per this repo's "build artifacts are committed, no CI build step" contract — done; final rebuild after all source edits succeeded with 0 errors, `sw.js` precaches 23 files (depends on all implementation tasks, T003-T018)
- [ ] T021 Run the complete `quickstart.md` validation pass (all four scenarios plus the Android-container regression check where a device/emulator is available) as the final gate before calling this feature done — **not executed**, blocked on the same browser-availability gap as T012/T014/T018/T019 (depends on T020)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion (T002) — BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion (T007)
  - US1 (Phase 3) and US2 (Phase 4) touch different files and can proceed in parallel
  - US3 (Phase 5) depends on Foundational directly for T015-T017, but its verification task T018 also depends on US1's T012 (needs the update flow working to test it for GDL books)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependency on US2/US3
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) — no dependency on US1/US3
- **User Story 3 (P2)**: Its implementation tasks (T015-T017) can start after Foundational; its full verification task (T018) additionally depends on US1's T012

### Parallel Opportunities

- T008 [US1, sw-src.ts] and T010 [US1, App.ts] can run in parallel (different files); T009 depends on T008, T011 depends on T010
- Once Foundational (Phase 2) completes, US1 (Phase 3) and US2 (Phase 4) can be worked in parallel by different people
- T017 [US3, GdlBookRuntime.ts] can run in parallel with T015/T016 [US3, sw-src.ts]
- T020 (rebuild) can be prepared in parallel with T019 (cold-start check) since they touch different concerns, but both must land before T021

---

## Parallel Example: User Story 1

```bash
# T008 and T010 touch different files and can be done together:
Task: "In sw-src.ts, call registerUpdateNotifier() after precaching setup, using the package's own channel"
Task: "In App.ts's registerServiceWorker(), replace Workbox registration with registerServiceWorkerUpdates(...)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (update delivery correctness)
4. Complete Phase 4: User Story 2 (offline playback preserved)
5. **STOP and VALIDATE**: Both P1 stories together satisfy the two acceptance scenarios in the source Jira ticket (MR-170) for CR books
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → sw-src can import npm packages
2. Add User Story 1 → validate via `quickstart.md` Scenario 3 → update delivery fixed for CR books
3. Add User Story 2 → validate via `quickstart.md` Scenario 2 → offline playback confirmed unaffected
4. Add User Story 3 → validate via `quickstart.md` regression checks → GDL parity confirmed, shared caching helper adopted
5. Polish → cold-start check, rebuild committed artifacts, full validation pass

### Parallel Team Strategy

With multiple developers, after Foundational (Phase 2) is done:
- Developer A: User Story 1 (`sw-src.ts` update-notifier + `App.ts` registration swap)
- Developer B: User Story 2 (offline fetch-handler regression check)
- Developer C: User Story 3 (`cacheUrlsWithProgress` adoption + GDL verification), starting implementation immediately but holding final verification (T018) until Developer A's T012 lands

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No automated tests exist in this repo (see `plan.md`) — "test" tasks above are the manual `quickstart.md` scenarios instead
- Commit after each task or logical group; commit the rebuilt `dist/app.js`/`sw.js` (T020) in the same change as the source edits, since this repo has no CI build step
- Avoid: vague tasks, same-file conflicts marked `[P]`, cross-story dependencies that break independent testability
