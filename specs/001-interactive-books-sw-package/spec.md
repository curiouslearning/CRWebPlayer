# Feature Specification: Interactive Books Service Worker Package Integration

**Feature Branch**: `001-interactive-books-sw-package`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Integrate service worker package into Interactive Books (Jira MR-170). As a developer, I want the Interactive Books sub-app to import and use the new `@curiouslearning/sw` service worker package, so that Interactive Books gets the same correct update behavior as FTM."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Child reader receives updated content after reconnecting (Priority: P1)

A child reader has previously used the app and has a book cached from an earlier version of the content. A new version of that book's content is deployed. The next time the reader opens the app with internet access, they should be reading the updated content, not the stale cached version.

**Why this priority**: This is the core defect being fixed (the same stale-content bug already fixed for FTM) and is explicitly called out as an acceptance scenario in the source ticket. Without this, content updates silently fail to reach readers who already have something cached.

**Independent Test**: Cache a book, deploy a change to that book's content, reconnect to the network, relaunch/reload the app, and confirm the updated content is what's served and rendered.

**Acceptance Scenarios**:

1. **Given** a book has been cached from a previous session, **When** a new version of that book's content is deployed and the reader reconnects to the internet, **Then** the app fetches and serves the new content instead of the stale cached version.
2. **Given** a new version is available, **When** the reader is prompted to update, **Then** the prompt only appears once the new version is actually ready to serve content (not before), so accepting it never results in stale content being shown.

---

### User Story 2 - Child reader keeps reading offline (Priority: P1)

A child reader has a book fully cached from a previous session. They open the app with no internet connection. The book should load and play back exactly as it did online.

**Why this priority**: Offline playback is the primary reason this app caches content at all; any regression here directly breaks the app's core value proposition for readers with unreliable connectivity. It is the second explicit acceptance scenario in the source ticket.

**Independent Test**: Fully cache a book, disconnect from the network, open the app, and confirm the book loads and plays back normally with no failed asset loads.

**Acceptance Scenarios**:

1. **Given** a book has been fully cached from a previous session, **When** the reader opens the app with no internet connection, **Then** the previously cached content loads and plays back correctly.
2. **Given** the reader is offline, **When** they navigate between pages of an already-cached book, **Then** no page fails to load due to a network request being attempted.

---

### User Story 3 - Both content types stay consistent (Priority: P2)

This app serves two different kinds of interactive books — Curious Reader (CR) books and Digital Library (GDL) books — through the same offline-caching and update mechanism. Adopting the shared update fix must not create a gap where one book type updates/caches correctly and the other doesn't.

**Why this priority**: This app is the only one of the sub-apps adopting the shared package that has to support two distinct content pipelines sharing one service worker. It's a repo-specific regression risk not present in the sibling integrations (FTM, Assessments), so it needs its own explicit coverage even though it's not called out separately in the source ticket.

**Independent Test**: Repeat User Story 1 and User Story 2 once for a CR book and once for a GDL book; both must pass identically.

**Acceptance Scenarios**:

1. **Given** a GDL book has been cached from a previous session, **When** a new version of its content is deployed and the reader reconnects, **Then** the updated GDL content is served instead of the stale version.
2. **Given** a GDL book is fully cached, **When** the reader opens it offline, **Then** it loads and plays back correctly, matching the offline behavior already required for CR books.

---

### Edge Cases

- What happens if the reader is offline and has never cached the requested book (nothing to fall back to)?
- What happens if the update-available prompt appears and the reader declines it — does the app keep working correctly on the old version until the next launch?
- What happens if the network drops partway through caching a book — does progress reporting and eventual completion still recover correctly on reconnect?
- How does the app behave the very first time it's opened, before any book has been cached and before a service worker is yet in control?
- Does the app running inside the native Android container (rather than a browser tab) receive the same update/caching notifications as it does today?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST notify the user that an update is available only after the new version has fully taken over serving content, never merely when a new version is first detected.
- **FR-002**: The app MUST continue to offer the reader a way to accept an available update and reload with the new content, for both CR and GDL books.
- **FR-003**: The app MUST continue to serve previously cached book content when the device has no internet connection, for both CR and GDL books.
- **FR-004**: The app MUST continue to report caching progress in a way that drives the existing on-screen progress indicator and the existing 25%/50%/75%/100% download-progress analytics events.
- **FR-005**: The app MUST continue to notify the native Android container of a book's cached status once caching completes, for apps running inside that container.
- **FR-006**: The app's update-detection and update-notification behavior MUST be provided by the shared, centrally-maintained service worker package rather than by app-specific logic, so this app benefits from the same fix already validated for the FTM and Assessments sub-apps.
- **FR-007**: Adopting the shared package MUST NOT change or regress existing caching/update behavior for either book type as observed by the reader.
- **FR-008**: The app MUST remain deployable through the existing build-and-commit process (built output committed to the repository, synced to hosting with no separate build step) after this change.

### Key Entities

- **Cached Book**: A CR or GDL book's downloaded content set (structured content plus media assets), tracked per book with a completion status the app uses to decide whether to show cached content immediately or trigger caching.
- **Service Worker Update**: The lifecycle state representing a newly available version of the app's offline asset cache, and whether it has become the version actually in control of serving content.
- **Caching Progress Event**: A percent-complete signal emitted while a book's assets are being downloaded into the cache, used to drive the on-screen progress indicator and analytics milestones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every reader with a previously cached book automatically receives newly deployed content the next time they reconnect to the internet, with no manual cache-clearing step required.
- **SC-002**: Every previously fully-cached book remains completely playable offline after this change, with no increase in offline load failures compared to before.
- **SC-003**: Update prompts never appear before the new version is actually ready to serve content — zero occurrences of a reader accepting an update and still seeing stale content.
- **SC-004**: The on-screen caching progress indicator and the 25%/50%/75%/100% analytics milestones continue to fire at the same points in the caching flow as before, for both CR and GDL books.

## Assumptions

- The `@curiouslearning/sw` package — already extracted from FTM's fix and published for reuse (per the parent epic) — is the designated shared package this app should adopt; selecting or building an alternative package is out of scope.
- The existing user-facing "update available, reload now?" interaction is acceptable to keep as-is; designing new update UX is out of scope.
- Both CR book and GDL book caching flows are in scope, since this app currently routes both through the same service worker and messaging channel.
- Deployment continues through the existing static-sync pipeline; introducing a CI build step is out of scope for this feature.
- The equivalent integration already completed for the Assessments sub-app is a useful reference for expected shape and behavior, but this app's dual CR/GDL caching logic means the implementation cannot be a direct copy.
