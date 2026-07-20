# Fix: Words Getting Stuck in Highlighted State During Read-Along Playback

Branch: AJ-711-universal-stuck-word-fix
File: src/PlayBackEngine/PlayBackEngine.ts (playPageAudio, ~lines 144-202)

## Problem

During karaoke-style word highlighting, `playPageAudio()` starts a 60ms
`setInterval` that scans every word's `[startTimestamp, endTimestamp]`
window against `audioElementDom.currentTime` to decide which word div
should carry the `cr-clickable-word-active` class / glow color.

The loop tracks only a single previous index (`lastWordIndex`) and only
unhighlights that one element when the newly matched index is strictly
greater than it (`if (lastWordIndex < currentIndex)`). It also adds the
active class unconditionally to *every* timestamp window that contains
`currentTime`, without first clearing other words.

When word timing windows overlap (`end[j] >= start[j+1]`, or a shorter
word's window is nested inside a longer neighboring window), the "last
matching index found while scanning 0..n in order" can:
- jump forward by more than one index in a single tick, or
- regress backward on a later tick (e.g. a longer word's window is
  still valid after a shorter, later word's window has already closed).

In the regression case, `lastWordIndex < currentIndex` becomes false, so
the previously-highlighted word is never told to unhighlight. Once
`currentTime` passes the final word's end timestamp, `clearInterval`
stops the loop for good — so nothing ever cleans up the orphaned word,
and it stays visually "stuck" (scaled + glow-colored) until the page is
torn down by `stopPageAudio()`.

A related, lower-severity issue: `enableConnectedGraphicHighlighting()`
→ `handleInteractiveWordClick(..., glowImageOnly=true)` fires once per
matching `j` per tick and stacks independent `setTimeout` closures onto
`this.currentGlowImageTimeout` (only the most recent is tracked), which
can leave connected glow-image highlights stuck/flickering under the
same overlap conditions.

## Goal

Make the per-tick highlight decision:
1. Correct under overlapping/adjacent/malformed timestamp data (no word
   can end up permanently highlighted).
2. Idempotent — re-running a tick with the same `currentTime` produces
   the same visual state, never accumulates stray classes.
3. Cheaper — avoid rescanning all words and avoid redundant DOM writes
   every tick (see Efficiency Notes).

## Proposed Approach

### 1. Resolve "the one current word" deterministically per tick

Replace the "first index found while scanning in array order, no break"
logic with a single deterministic rule, e.g.:

> The current word is the highest-indexed word whose `startTimestamp <=
> currentTime`, clamped to the last word whose `endTimestamp` hasn't
> been exceeded by more than a small grace window (to preserve existing
> "stay highlighted through the end" behavior).

```ts
function resolveCurrentWordIndex(
    timestamps: WordTimestampElement[],
    currentTime: number,
    searchStartHint: number
): number {
    let idx = searchStartHint;
    // Advance forward while the next word has already started.
    while (idx < timestamps.length - 1 && currentTime >= timestamps[idx + 1].startTimestamp) {
        idx++;
    }
    // Handle seeks/scrubs backward (audio.currentTime can jump).
    while (idx > 0 && currentTime < timestamps[idx].startTimestamp) {
        idx--;
    }
    return idx;
}
```

This removes the "scan everything, overwrite `currentIndex` with
whatever matched last" pattern entirely, so overlap can no longer
produce a non-monotonic sequence of "current" indices relative to what
was highlighted last tick — there is exactly one current index per
tick, full stop.

### 2. Diff against previous tick instead of single-slot bookkeeping

```ts
const newIndex = resolveCurrentWordIndex(timestamps, currentTime, currentIndex);
if (newIndex !== currentIndex) {
    if (this.currentlyActiveWord) {
        this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
        this.currentlyActiveWord.style.color = "white";
    }
    const wordElement = document.getElementById(audioElement.domID + "_word_" + newIndex) as HTMLDivElement;
    wordElement.classList.add("cr-clickable-word-active");
    wordElement.style.color = audioElement.glowColor;
    this.currentlyActiveWord = wordElement;
    this.enableConnectedGraphicHighlighting(pageIndex, newIndex);
    currentIndex = newIndex;
}
```

Using `this.currentlyActiveWord` (already an existing field) as the
single source of truth for "what to unhighlight" removes the dependency
on `lastWordIndex` reconstructing a DOM id string and re-querying the
DOM, and guarantees at most one element is ever in the active state.

### 3. Fix the end-of-audio cleanup

Change the final cleanup (currently `PlayBackEngine.ts:190-197`) to use
`this.currentlyActiveWord` instead of `currentIndex`, so it always
clears whatever is actually highlighted rather than whatever the loop
variable happened to land on:

```ts
if (currentTime >= timestamps[timestamps.length - 1].endTimestamp - 0.1) {
    if (this.currentlyActiveWord) {
        this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
        this.currentlyActiveWord.style.color = "white";
        this.currentlyActiveWord = null;
    }
    this.currentlyPlayingAudioElement = null;
    clearInterval(this.currentPageAutoPlayerInterval);
}
```

### 4. Fix connected glow-image timeout stacking

In `handleInteractiveWordClick` (`PlayBackEngine.ts:581-642`), when
called with `glowImageOnly=true` from `enableConnectedGraphicHighlighting`,
always clear the previous `this.currentGlowImageTimeout` before scheduling
a new one (currently this clear is skipped for the `glowImageOnly` path),
and only re-run the glow-image highlight/timeout logic when `wordIndex`
actually changes (guard this the same way as step 2, driven by the same
`newIndex !== currentIndex` check), instead of on every tick.

### 5. Guard against missing/malformed timestamp data

Add defensive checks (`wordElement` possibly null if DOM id mismatches,
`timestamps.length === 0`) so a bad content file can't throw inside the
interval callback and silently kill the highlighting loop mid-page.

## Efficiency Notes

- Current code: O(n) scan of all words every 60ms tick, with up to `n`
  redundant `classList.add`/`style.color` DOM writes per tick when
  windows overlap.
- After fix: O(1) amortized per tick via the forward/backward cursor in
  `resolveCurrentWordIndex` (only touches more than 1-2 comparisons per
  tick during normal monotonic playback), and at most 2 DOM writes
  (one remove, one add) per tick, and only on ticks where the active
  word actually changes — zero DOM writes on every other tick.
- This also naturally reduces work for pages with long sentences (large
  `timestamps.length`), where the current implementation's cost grows
  linearly with sentence length on every single tick regardless of
  where playback currently is.

## Testing Plan

1. Unit-test `resolveCurrentWordIndex` directly with:
   - Non-overlapping, contiguous timestamps (baseline/regression case).
   - Adjacent overlap (`end[j] > start[j+1]` by a small epsilon).
   - Nested/enveloping overlap (`start[j] <= start[j+1]` and
     `end[j] >= end[j+1]`).
   - Out-of-order / decreasing `currentTime` (simulating a user seek).
   - Empty timestamps array / single-word sentence.
2. Manual verification in the app (use the `run` skill / dev build):
   - Play a page with known-overlapping timestamps (check content JSON
     for `timeStampForEachText` entries where two entries' start/end
     overlap) and confirm only one word is ever highlighted at a time,
     and that highlighting always clears at the end of playback.
   - Click-to-replay a single word (`handleInteractiveWordClick`) while
     page audio is not playing, and again while it *is* playing, to
     confirm no interaction with the interval-based state leaves
     leftover highlights.
   - Navigate away from a page mid-sentence (swipe/drag) and confirm
     `stopPageAudio()` still fully resets all word styling as a safety
     net.
3. Regression-check connected glow-image highlighting still lights up
   in sync with the correct word after the changes in step 4.

## Files Touched

- `src/PlayBackEngine/PlayBackEngine.ts`
  - `playPageAudio()`
  - `handleInteractiveWordClick()`
  - `enableConnectedGraphicHighlighting()`
  - (new) `resolveCurrentWordIndex()` helper, or inlined equivalent
- Possibly `src/Models/WordTimestampElement.ts` if a `word index` or
  epsilon tolerance needs to be added to the model (not expected to be
  necessary).
