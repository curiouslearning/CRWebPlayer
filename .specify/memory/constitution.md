<!--
Sync Impact Report
==================
Version change: (template, unversioned) → 1.0.0
Rationale: Initial ratification of the baseline constitution — MAJOR (0 → 1.0.0),
  establishing the governing principles for the first time.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. TypeScript-First & Strict Type Safety
  - [PRINCIPLE_2_NAME] → II. SOLID Object-Oriented Design
  - [PRINCIPLE_3_NAME] → III. Functional Core, Imperative Shell
  - [PRINCIPLE_4_NAME] → IV. Specification-Driven Testing (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Production-Ready, Proven Dependencies

Added sections:
  - Section 2: Environment-Based Git Process
  - Section 3: Development Workflow & Quality Gates

Removed sections:
  - Governance (intentionally omitted per project direction — see footer note)

Deferred / follow-up TODOs:
  - None. All placeholders resolved.

Templates reviewed for alignment:
  - .specify/templates/plan-template.md — Constitution Check gate remains compatible.
  - .specify/templates/spec-template.md — no changes required.
  - .specify/templates/tasks-template.md — test-task ordering matches Principle IV.
-->

# Curious Reader Web Player Constitution

## Core Principles

### I. TypeScript-First & Strict Type Safety

All application code MUST be authored in TypeScript. Runtime and build logic
(`App.ts`, `sw-src.ts`, `src/**`, `scripts/**`) MUST compile through the project's
`ts-loader`/`ts-jest` toolchain without introducing new type errors.

- Public boundaries — parser outputs, model shapes, service-worker message payloads,
  and cross-`BroadcastChannel` contracts — MUST be described by explicit `interface`
  or `type` declarations (see `src/Models/*.ts`), never inferred `any`.
- `any` is prohibited in new code except at genuinely untyped third-party seams, and
  each such use MUST be isolated behind a typed adapter and commented with its reason.
- Domain concepts MUST be modeled as named types rather than primitive obligations
  (e.g. a word-timestamp window is a type, not a loose pair of numbers).

Rationale: There is no backend and no runtime schema validation layer — the type
system is the primary correctness contract for content parsing and offline caching.

### II. SOLID Object-Oriented Design

Stateful subsystems — the playback engine, parsers, loaders, analytics, and the
caching coordinator — MUST be organized as cohesive classes/modules that honor the
SOLID principles.

- Single Responsibility: a class owns one reason to change (parsing ≠ rendering ≠
  analytics ≠ caching). New responsibilities get new units, not new branches in an
  existing one.
- Open/Closed & Liskov: extend behavior through new implementations of a stable
  abstraction (e.g. the `createBookLoader()` loader seam), not by editing callers.
  New book types are added as new loaders/runtimes, never as inline `bookName`
  conditionals.
- Interface Segregation & Dependency Inversion: high-level flow depends on narrow
  abstractions (loader, parser, engine), and collaborators are injected rather than
  reached for globally.

Rationale: The book pipeline (`ContentParser` → `PlayBackEngine`, `BookLoader`
variants) is the most actively iterated code; SOLID boundaries keep new content
formats and partner special cases from eroding the core.

### III. Functional Core, Imperative Shell

Pure logic MUST be expressed functionally and kept separate from side effects.

- Transformation and decision logic (parsing JSON into models, computing the current
  highlighted word from a timestamp and `currentTime`, deriving progress milestones)
  MUST be pure functions: deterministic, no I/O, no hidden mutation of inputs.
- Prefer immutable data and non-mutating array/object operations; localize mutation,
  DOM manipulation, `fetch`, `localStorage`, timers, and messaging to thin imperative
  wrappers around the pure core.
- Existing partner-specific patches remain intentionally narrow and MUST NOT be
  generalized; new logic MUST NOT add such branches — extend via abstraction instead.

Rationale: Pure functions are the units that Principle IV can exhaustively specify,
and separating them from the DOM/service-worker shell makes the karaoke-timing and
caching logic testable without a browser.

### IV. Specification-Driven Testing (NON-NEGOTIABLE)

Every non-trivial pure function and every parsing/business rule MUST be covered by
unit tests, authored in Gherkin (Given/When/Then) style, in the project's Jest
toolchain.

- Test files MUST use the `.spec.ts` suffix (never `.test.ts`) and live alongside the
  code under test or under a mirrored test path.
- Each test MUST be structured as a scenario: a `Given` setup, a `When` action, and a
  `Then` assertion, with descriptive names that read as behavioral specifications.
- The functional core (Principle III) MUST be tested directly, without a DOM. Bugs
  fixed in the highlighting/caching logic MUST ship with a regression scenario.
- Recommended tooling (reuse-first): standardize on the already-present `jest` +
  `ts-jest`. For authoring true Gherkin `.feature` files bound to step definitions,
  `jest-cucumber` is the recommended addition; absent it, encode Given/When/Then as
  nested `describe`/`it` blocks. New test dependencies MUST satisfy Principle V.

Rationale: With no CI test gate and committed build artifacts, specification-style
unit tests are the enforceable safety net for the parser and playback logic.

### V. Production-Ready, Proven Dependencies

The codebase targets production reliability; dependency choices MUST be conservative.

- Reuse what the repo already provides before adding anything: `@splidejs/splide`,
  `firebase`, the `workbox-*` family, `@curiouslearning/sw`, and the Jest toolchain.
- New dependencies MUST be stable, maintained, and widely adopted. Experimental,
  pre-1.0, unmaintained, or single-purpose "alpha" packages are prohibited unless no
  proven alternative exists, in which case the choice MUST be justified in the PR.
- Prefer standard-library and platform APIs over dependencies for trivial needs.
- Build integrity is part of "production-ready": any change to `src/**`, `App.ts`, or
  `sw-src.ts` MUST be rebuilt (`npm run build`) and the regenerated `dist/app.js` and
  `sw.js` committed in the same change, because deployment ships the committed tree.

Rationale: Content is served statically and cached offline for low-connectivity
learners; unstable dependencies or a stale build directly break users in the field.

## Environment-Based Git Process

Delivery follows a two-environment, branch-per-environment model (for now):

- `develop` is the integration environment. It deploys to
  `s3://curious-reader-books-development` and is the target for all day-to-day work.
- `main` is the production environment. It deploys to
  `s3://curious-reader-books-production` and MUST only receive changes promoted from
  `develop`.

Rules:

- Feature and fix work MUST be done on short-lived branches taken from `develop` and
  merged back into `develop` via pull request — never committed directly to `main`.
- Promotion to production MUST be a pull request from `develop` into `main`, so that
  everything in `main` has first been integrated and validated on `develop`.
- Because CircleCI syncs the repo tree to S3 without building, every branch that
  deploys MUST already contain the correct, rebuilt `dist/app.js` and `sw.js`
  (Principle V). A merge that changes source without refreshed artifacts is invalid.
- Additional environments/branches (e.g. `Partner`) are out of scope for this baseline
  and MAY be added later without violating this section.

## Development Workflow & Quality Gates

- Correctness signal: `npm run build` (webpack + `ts-loader` + service-worker manifest
  injection) is the authoritative build/type check. `tsc --noEmit -p .` is known to be
  unreliable for this repo and MUST NOT be treated as the gate.
- Tests: `npm test` (Jest) MUST pass for the touched areas before a pull request is
  opened; new/changed pure logic MUST arrive with `.spec.ts` scenarios (Principle IV).
- Pull requests MUST state which principles are affected and confirm that build
  artifacts were regenerated when source changed.
- Reviews SHOULD reject added complexity, new `bookName`-style special-case branches,
  and experimental dependencies unless explicitly justified against these principles.

**Version**: 1.0.0 | **Ratified**: 2026-08-10 | **Last Amended**: 2026-08-10

<!--
Note: A formal Governance section is intentionally omitted for this baseline per
project direction. The version/ratification metadata above is retained as document
provenance, not as a governance process.
-->
