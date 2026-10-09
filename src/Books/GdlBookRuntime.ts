import { registerServiceWorkerUpdates } from "@curiouslearning/sw";
import { handleLoadingMessage, firebaseAnalyticsManager, appName, appVersion, readLanguageDataFromCacheAndNotifyAndroidApp } from "../../App";
import { campaignId, campaignSource, crUserId } from "../common";

const gdlBroadcastChannel = new BroadcastChannel("cr-message-channel");

/**
 * Register the service worker and trigger GDL book caching in the background.
 * Runs fire-and-forget — never blocks the main book initialization flow.
 * Uses a 1.5s timeout on navigator.serviceWorker.ready to avoid hanging on
 * Android WebViews where the SW can take indefinitely to activate.
 */
async function registerServiceWorkerForGdl(config: {
  bookName: string;
  gdlId: string;
  basePath: string;
  contentFile: string;
}) {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await registerServiceWorkerUpdates({
      swUrl: '/sw.js',
      mode: 'confirm',
    });

    // Race against a 1.5s timeout — navigator.serviceWorker.ready can hang
    // indefinitely inside Android WebViews when offline or during SW activation.
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);

    if (localStorage.getItem(config.bookName) == null && navigator.onLine) {
      console.log("GDL: Starting asset caching for " + config.bookName);
      gdlBroadcastChannel.postMessage({
        command: "Cache",
        data: {
          type: "gdl",
          bookName: config.bookName,
          gdlId: config.gdlId,
          basePath: config.basePath,
          contentFile: config.contentFile,
        },
      });
    }
  } catch (error) {
    console.log("Error registering service worker for GDL:", error);
  }
}

/**
 * The gdl-player web component renders into an open shadow root whose own stylesheet
 * ships a couple of layout bugs we can't fix at the source (it's a separate, vendored
 * library — this only patches the compiled output). Since the shadow root is
 * `mode: "open"`, we can reach in from here and append an override stylesheet. This
 * must only run once per element (its connectedCallback only builds the internal
 * stylesheet once).
 *
 * - `.player` is sized with `height: 100vh; position: relative`. On real mobile devices
 *   `100vh` is the static/layout viewport height — it does not shrink when the browser's
 *   address bar is visible, and it ignores any leftover margin on the host page's
 *   html/body — so `.player` ends up taller than the actually visible screen and the
 *   page becomes scrollable. Pinning it to `position: fixed; inset: 0` instead sizes it
 *   against the *visual* viewport, independent of both the address bar and ancestor margin.
 * - `.cover-illustration` (the front-page cover image wrapper) has `width: 20rem;
 *   overflow: hidden` but no height, so its height comes purely from the cover image's
 *   natural aspect ratio — a tall cover image can push it past the visible page. Its
 *   ancestor chain is `.cover-page` (no height of its own, a `.swiper-slide` flex child
 *   that isn't stretched since the slide uses `align-items: center`) inside the cover
 *   `.swiper-slide` itself — which has a later, unprefixed `.swiper-slide { height: auto }`
 *   rule (from swiper's autoHeight CSS) that wins over its own earlier `height: 100%`
 *   rule. So the whole chain needs a definite height first: the cover slide is pinned
 *   (scoped by `data-hash="cover"` so other slides keep autoHeight) and `.cover-page`
 *   becomes a column flexbox. `.cover-page` also contains the title/credit text as a
 *   sibling *after* the illustration — `<div class="mt-2 text-center"><h2>` in older
 *   bundles, `<div class="cover-text"><h1>` in newer ones (some newer bundles also use
 *   `max-width: 20rem` instead of `width: 20rem` on the illustration).
 *
 *   The illustration and title are centered together as a group, the title pinned to
 *   `flex-shrink: 0` so it always keeps its natural size, and the illustration is
 *   `flex: 0 1 auto; min-height: 0` so it only shrinks when the page is too short to fit
 *   both. Its post-flex height is definite (the cover page has a definite height), so the
 *   `<img>` can use `max-height: 100%` with `object-fit: contain` to scale the whole
 *   cover art down without cropping it. The vendored `20rem` width cap is lifted (to 90%
 *   of the page) — on large screens it otherwise leaves the cover art a small 320px
 *   thumbnail on a 1280×600 stage.
 * - The older bundles' cover title is a fixed `text-xl` (18px) that looks tiny on large
 *   screens; it gets the same viewport-scaled `clamp()` sizes the newer bundles ship for
 *   their `.cover-text h1`/`small`.
 */
function applyGdlPlayerStyleOverrides(player: Element): void {
  const shadowRoot = (player as HTMLElement).shadowRoot;
  if (!shadowRoot) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    .player {
      position: fixed !important;
      inset: 0 !important;
      width: auto !important;
      height: auto !important;
    }
    .swiper-slide[data-hash="cover"] {
      height: 100% !important;
    }
    .cover-page {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 0.75rem !important;
      height: 100% !important;
      box-sizing: border-box !important;
      padding: 1rem 0 !important;
    }
    .cover-page .cover-illustration {
      flex: 0 1 auto !important;
      min-height: 0 !important;
      height: auto !important;
      width: auto !important;
      max-width: 90% !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
    }
    .cover-page .cover-illustration img {
      display: block !important;
      width: auto !important;
      height: auto !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
    }
    .cover-page > .mt-2,
    .cover-page > .cover-text {
      flex-shrink: 0 !important;
      margin-top: 0 !important;
      text-align: center !important;
    }
    .cover-page > .mt-2 h2 {
      font-size: clamp(1rem, -0.25rem + 4vw, 1.75rem) !important;
    }
    .cover-page > .mt-2 small {
      font-size: clamp(0.8rem, -0.2rem + 2vw, 1rem) !important;
    }
  `;
  shadowRoot.appendChild(style);
}

/**
 * The gdl-player's own per-page component schedules its audio autoplay from a
 * `setTimeout(..., 750)` fired by a `useEffect` that returns no cleanup function, and
 * swiper keeps every page mounted rather than unmounting inactive ones. So flipping
 * pages faster than 750ms leaves several of these stale timers pending — each one
 * later calls `onPlay()` on its own now-inactive page regardless of whether the user
 * is still on it, starting multiple pages' audio back-to-back or simultaneously. We
 * can't cancel someone else's `setTimeout` from outside, so instead we enforce a
 * single-audio invariant: whenever any audio the player controls starts playing, pause
 * whichever one was previously playing.
 *
 * `currentlyPlayingGdlAudio` is shared with `patchGlobalAudioConstructorForSingleGdlPlayback`
 * below because the player uses two entirely different kinds of audio that this single
 * invariant has to cover:
 *  - The per-word click/highlight audio is a real `<audio>` element rendered into the
 *    shadow DOM, so its `play` event is observable from a capture-phase listener on the
 *    shadow root (the native `play` event doesn't bubble, but capture-phase listeners on
 *    an ancestor still fire for non-bubbling events, since capturing happens on the way
 *    *down* to the target regardless of whether the event bubbles back up).
 *  - The per-page narration audio is a bare `new Audio()` object that is never attached to
 *    the document (see the constructor patch below) — it has no ancestors at all, so this
 *    shadow-root listener can never see it play. Without sharing the same "currently
 *    playing" reference across both, a page's narration audio and another page's
 *    word-click audio (or two pages' narration audio) could still overlap.
 */
let currentlyPlayingGdlAudio: HTMLAudioElement | null = null;

function claimSingleGdlAudioPlayback(audio: HTMLAudioElement): void {
  if (currentlyPlayingGdlAudio && currentlyPlayingGdlAudio !== audio && !currentlyPlayingGdlAudio.paused) {
    currentlyPlayingGdlAudio.pause();
  }
  currentlyPlayingGdlAudio = audio;
}

function enforceSingleGdlAudioPlayback(player: Element): void {
  const shadowRoot = (player as HTMLElement).shadowRoot;
  if (!shadowRoot) {
    return;
  }
  shadowRoot.addEventListener(
    "play",
    (event) => claimSingleGdlAudioPlayback(event.target as HTMLAudioElement),
    true
  );
}

/**
 * The gdl-player's swiper `onSlideChange` only records the new page index (and logs
 * `page_turned`) — nothing stops audio when the page changes. The outgoing page's
 * narration is only cut off once the incoming page starts its own narration (750ms after
 * it becomes active, on top of the 1200ms page transition), and on a page with no
 * narration at all (cover, credits, illustration-only pages) it plays to the end.
 *
 * We hook the player's swiper and stop whatever GDL audio is playing as soon as the
 * slide changes. Narration audio (a detached `new Audio()`, see
 * `patchGlobalAudioConstructorForSingleGdlPlayback`) is also sent an `ended` event, so
 * the player runs its own end-of-narration cleanup for the outgoing page: clears its
 * word-highlight interval, removes leftover highlights, and resets its play button.
 */
function stopCurrentGdlAudio(): void {
  const audio = currentlyPlayingGdlAudio;
  if (!audio || audio.paused) {
    return;
  }
  audio.pause();
  if (!audio.isConnected) {
    audio.dispatchEvent(new Event("ended"));
  }
}

function stopGdlAudioOnPageChange(player: Element): void {
  const shadowRoot = (player as HTMLElement).shadowRoot;
  if (!shadowRoot) {
    return;
  }
  // The swiper is created by the player's React tree after the element is attached, so
  // wait for its instance (exposed on the `.swiper` element) to appear.
  let attempts = 0;
  const attach = () => {
    const swiper = (shadowRoot.querySelector(".swiper") as any)?.swiper;
    if (swiper && typeof swiper.on === "function") {
      swiper.on("slideChange", () => {
        // Read by the patched page autoplay timer (see patchGdlPlayerStaleAutoplay).
        const win = window as any;
        win.__crGdlPageChanges = (win.__crGdlPageChanges || 0) + 1;
        stopCurrentGdlAudio();
      });
      return;
    }
    if (++attempts < 150) {
      setTimeout(attach, 200);
    } else {
      console.warn("GDL: Player swiper not found; audio won't stop on page change");
    }
  };
  attach();
}

/**
 * The gdl-player never listens for the page being hidden, so narration (and word audio)
 * keeps playing after the user sends the container app to the background or switches
 * tabs. We stop whatever GDL audio is playing as soon as the page is hidden, the same way
 * a page change does (see `stopCurrentGdlAudio`). The page-change counter is also bumped
 * so a narration autoplay timer still pending from a just-turned page (see
 * `patchGdlPlayerStaleAutoplay`) can't start audio while the app is in the background.
 * Guarded to run once regardless of how many GDL books load in this session.
 */
function stopGdlAudioWhenHidden(): void {
  const win = window as any;
  if (win.__crGdlHiddenListenerAdded) {
    return;
  }
  win.__crGdlHiddenListenerAdded = true;

  const stopForHiddenPage = () => {
    win.__crGdlPageChanges = (win.__crGdlPageChanges || 0) + 1;
    stopCurrentGdlAudio();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopForHiddenPage();
    }
  });
  // Some WebViews/iOS Safari fire `pagehide` without a preceding `visibilitychange`.
  window.addEventListener("pagehide", stopForHiddenPage);
}

/**
 * Patches the global `Audio` constructor so every detached `new Audio()` instance the
 * gdl-player creates for page narration (rather than a real `<audio>` element — see
 * `enforceSingleGdlAudioPlayback` above for why that distinction matters) also
 * participates in the single-audio invariant. Must run before the vendored player
 * script is injected, since it needs `window.Audio` patched before the bundle's first
 * `new Audio()` call. Guarded to run once regardless of how many GDL books load in this
 * session.
 */
function patchGlobalAudioConstructorForSingleGdlPlayback(): void {
  const win = window as any;
  if (win.__gdlAudioConstructorPatched) {
    return;
  }
  win.__gdlAudioConstructorPatched = true;

  const NativeAudio = win.Audio;
  if (!NativeAudio) {
    return;
  }

  function PatchedAudio(...args: any[]): HTMLAudioElement {
    const audio: HTMLAudioElement = new NativeAudio(...args);
    audio.addEventListener("play", () => claimSingleGdlAudioPlayback(audio));
    return audio;
  }
  PatchedAudio.prototype = NativeAudio.prototype;
  win.Audio = PatchedAudio;
}

/**
 * The dotlottie-web runtime bundled into gdlplayer.umd.js decides whether a Lottie may
 * start animating with an "is this canvas on screen" check that requires the canvas's
 * bounding box to be *entirely* inside the window. When `play()` is called on a canvas
 * that is only partly visible (e.g. a large Lottie that bleeds past the top/side of the
 * page, which is common on small phone screens), it freezes the animation instead. Its
 * IntersectionObserver would normally unfreeze it once the canvas scrolls into view, but
 * that observer only fires on a *change* in visibility — a canvas that was already partly
 * visible never triggers it again, so the Lottie stays stuck on its first frame forever.
 *
 * The player's word-timed Lottie effects hit this every time: they call `play()` and
 * immediately flip their React `play` state back to false in the same tick, so the
 * render config never switches `freezeOnOffscreen` off and the frozen state is final.
 *
 * We can't fix the vendored bundle at its source, so we rewrite that one helper to treat
 * "any part of the canvas overlaps the viewport" as on-screen. Canvases that are fully
 * off-screen (e.g. mid page-swipe) still freeze, and are unfrozen by the observer once
 * they slide in.
 */
const GDL_FULLY_IN_VIEWPORT_CHECK =
  /function ([A-Za-z_$][\w$]*)\(e\)\{let t=e\.getBoundingClientRect\(\);return t\.top>=0&&t\.left>=0&&t\.bottom<=\(window\.innerHeight\|\|document\.documentElement\.clientHeight\)&&t\.right<=\(window\.innerWidth\|\|document\.documentElement\.clientWidth\)\}/;

function patchGdlPlayerLottieVisibilityCheck(source: string): string {
  if (!GDL_FULLY_IN_VIEWPORT_CHECK.test(source)) {
    console.warn("GDL: Lottie visibility check not found in gdl-player bundle; leaving it unpatched");
    return source;
  }
  return source.replace(
    GDL_FULLY_IN_VIEWPORT_CHECK,
    (_match, name) =>
      `function ${name}(e){let t=e.getBoundingClientRect();return t.bottom>0&&t.right>0&&t.top<(window.innerHeight||document.documentElement.clientHeight)&&t.left<(window.innerWidth||document.documentElement.clientWidth)}`
  );
}

/**
 * The gdl-player's page component renders its narration play button unconditionally, so
 * illustration-only pages (no `audio` entry and no words — e.g. Colours pages 2, 4, 6, 8,
 * 10 and 13) still show a play button that does nothing when pressed (narration only
 * starts when the page has an `audio.pageAudio.path`).
 *
 * We rewrite the button so it is only rendered when the page has narration audio. The
 * page component destructures the page's audio as `{…audio:<name>,background:…}=e` shortly
 * before rendering the button (`<jsx>.jsx("button",{disabled:!0===…`); group 2 captures
 * that audio variable name, which differs between bundle builds.
 */
const GDL_PAGE_PLAY_BUTTON =
  /(\{(?:_id:[\w$]+,)?audio:([\w$]+),background:[\s\S]{0,3000}?)([\w$]+\.jsx\("button",\{disabled:!0===)/;

function patchGdlPlayerPlayButtonWithoutAudio(source: string): string {
  if (!GDL_PAGE_PLAY_BUTTON.test(source)) {
    console.warn("GDL: Page play button not found in gdl-player bundle; leaving it unpatched");
    return source;
  }
  return source.replace(
    GDL_PAGE_PLAY_BUTTON,
    (_match, before, audio, button) => `${before}${audio}?.pageAudio?.path&&${button}`
  );
}

/**
 * The gdl-player's page component auto-plays narration from an effect that schedules
 * `setTimeout(play, 750)` once the page becomes active, but never returns a cleanup to
 * cancel it. Swiping past a page in under 750ms leaves that timer pending, and it later
 * starts the skipped page's narration while the reader is already elsewhere — after
 * `stopGdlAudioOnPageChange` has already run, and with nothing to replace it if the page
 * they landed on has no narration of its own.
 *
 * We rewrite the effect to return a cleanup that clears its timer. React runs it when the
 * page stops being active (and when a play-button press starts narration first, which
 * also stops the autoplay from restarting it a second time).
 *
 * React only runs that cleanup after it re-renders for the page change, so a timer that
 * comes due in between (seen when the main thread is busy or timers are throttled) would
 * still fire. The timer therefore also records the page-change count from
 * `stopGdlAudioOnPageChange` (bumped synchronously on every slide change) and only plays
 * if no page change has happened since it was scheduled.
 */
const GDL_PAGE_AUTOPLAY_EFFECT =
  /([\w$]+\.useEffect\(\(\(\)=>\{)([\w$]+&&null===[\w$]+&&[\w$]+&&[\w$]+)&&setTimeout\(\(\(\)=>\{([\w$]+)\(\)\}\),750\)\}\)/;

function patchGdlPlayerStaleAutoplay(source: string): string {
  if (!GDL_PAGE_AUTOPLAY_EFFECT.test(source)) {
    console.warn("GDL: Page narration autoplay effect not found in gdl-player bundle; leaving it unpatched");
    return source;
  }
  return source.replace(
    GDL_PAGE_AUTOPLAY_EFFECT,
    (_match, effectStart, condition, play) =>
      `${effectStart}if(${condition}){const crPageChanges=window.__crGdlPageChanges;const crAutoplayTimer=setTimeout((()=>{crPageChanges===window.__crGdlPageChanges&&${play}()}),750);return()=>clearTimeout(crAutoplayTimer)}})`
  );
}

/**
 * Resolve the URL to load the gdl-player bundle from: a Blob URL of the patched source
 * (see `patchGdlPlayerLottieVisibilityCheck`, `patchGdlPlayerPlayButtonWithoutAudio` and
 * `patchGdlPlayerStaleAutoplay`),
 * or the original URL if fetching it fails so the book still loads, just without the
 * fixes. The fetch goes through the service worker like any other request, so this
 * works offline once the book is cached.
 */
async function resolveGdlPlayerScriptUrl(scriptUrl: string): Promise<{ url: string; isBlob: boolean }> {
  try {
    const response = await fetch(scriptUrl);
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const patchedSource = patchGdlPlayerStaleAutoplay(
      patchGdlPlayerPlayButtonWithoutAudio(patchGdlPlayerLottieVisibilityCheck(await response.text()))
    );
    const blob = new Blob([patchedSource], { type: "text/javascript" });
    return { url: URL.createObjectURL(blob), isBlob: true };
  } catch (error) {
    console.error("GDL: Failed to fetch gdl-player bundle for patching, loading it unpatched:", error);
    return { url: scriptUrl, isBlob: false };
  }
}

/**
 * Enforce landscape mode through Android bridge call (same as CR books)
 */
function enforceLandscapeMode(): void {
  // @ts-ignore
  if (window.Android && typeof window.Android.setContainerAppOrientation === "function") {
    // @ts-ignore
    window.Android.setContainerAppOrientation("landscape");
  }
}

/**
 * Initialize GDL book by registering SW caching and dynamically loading CSS and UMD JS files.
 * @param bookName The book name (should start with "gdl-")
 */
export async function initializeGdlBook(bookName: string): Promise<void> {
  const gdlId = bookName.substring(4); // Remove "gdl-" prefix
  console.log("Initializing GDL book: " + gdlId);

  // Must happen before the vendored player script (appended below) ever runs, so its
  // page-narration `new Audio()` calls pick up the patched constructor.
  patchGlobalAudioConstructorForSingleGdlPlayback();
  stopGdlAudioWhenHidden();

  // Always re-query from DOM — module-level reference can be stale in WebViews
  const loadingScreen = document.getElementById("loadingScreen");

  // Bridge calls into the native Android container and analytics logging must never be
  // allowed to throw here — an uncaught error would abort this function before the
  // gdl-player script is even appended, permanently stranding the user on the loading
  // screen (its dismissal is driven entirely by that script's onload/onerror below).
  try {
    // Enforce landscape mode (same as CR books)
    enforceLandscapeMode();

    // Notify Android container app of the current cached status
    readLanguageDataFromCacheAndNotifyAndroidApp(bookName);
  } catch (error) {
    console.error("Error during GDL Android bridge calls:", error);
  }

  // Only show the loading screen if we're actually about to cache this book now.
  // If it's already cached, or we're offline with nothing to cache, no "CachingProgress"
  // event will ever arrive to dismiss it, so hide it immediately in those cases instead.
  const isCached = localStorage.getItem(bookName) !== null;
  const willCacheNow = !isCached && navigator.onLine;
  if (loadingScreen) {
    loadingScreen.style.display = willCacheNow ? "flex" : "none";
  }

  try {
    // Log session start
    firebaseAnalyticsManager.logSessionStartWithPayload({
      app: appName,
      version: appVersion,
      cr_user_id: crUserId,
      source: campaignSource,
      campaignId: campaignId,
      book_name: bookName
    });
  } catch (error) {
    console.error("Error logging GDL session start:", error);
  }

  const basePath = `/interactive-book-static/${gdlId}/`;
  const contentFile = `${basePath}content.json`;

  // Kick off SW caching in the BACKGROUND — do NOT await this.
  // Awaiting SW registration/ready can hang indefinitely on Android WebViews.
  registerServiceWorkerForGdl({ bookName, gdlId, basePath, contentFile });

  // Set up progress listener BEFORE caching messages arrive.
  // handleLoadingMessage hides the loading screen once progress hits 100%.
  gdlBroadcastChannel.onmessage = (event) => {
    console.log(event.data.command);
    if (event.data.command == "CachingProgress") {
      const progressValue = parseInt(event.data.data.progress);
      handleLoadingMessage(event, progressValue);
    }
  };

  // Load CSS dynamically
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${basePath}my-lib-style.css`;
  document.head.appendChild(link);

  // Load UMD JS dynamically (patched — see patchGdlPlayerLottieVisibilityCheck)
  const scriptSource = await resolveGdlPlayerScriptUrl(`${basePath}gdlplayer.umd.js`);
  const script = document.createElement("script");
  script.src = scriptSource.url;

  script.onload = () => {
    if (scriptSource.isBlob) {
      URL.revokeObjectURL(scriptSource.url);
    }

    // Ensure gdl-player element exists
    let player = document.querySelector("gdl-player");
    if (!player) {
      player = document.createElement("gdl-player");
      (player as HTMLElement).id = gdlId;

      // Insert before the loading screen if present, otherwise append to body
      const currentLoading = document.getElementById("loadingScreen");
      if (currentLoading && currentLoading.parentElement) {
        currentLoading.parentElement.insertBefore(player, currentLoading);
      } else {
        document.body.appendChild(player);
      }

      applyGdlPlayerStyleOverrides(player);
      enforceSingleGdlAudioPlayback(player);
      stopGdlAudioOnPageChange(player);
    } else {
      (player as HTMLElement).id = gdlId;
    }

    // If we're actively caching this book, leave the loading screen up — it's dismissed
    // by handleLoadingMessage once caching progress hits 100%. Otherwise (already cached,
    // or offline with nothing to cache) there's no progress event coming, so hide it now.
    if (!willCacheNow) {
      const currentLoading = document.getElementById("loadingScreen");
      if (currentLoading) {
        currentLoading.style.display = "none";
      }
    }

    console.log("GDL book loaded successfully: " + gdlId);
  };

  script.onerror = () => {
    // The player can't run at all here, so there's nothing left to wait for —
    // always hide, regardless of caching state.
    console.error("Failed to load GDL book script: " + gdlId);
    const currentLoading = document.getElementById("loadingScreen");
    if (currentLoading) {
      currentLoading.style.display = "none";
    }
  };

  document.body.appendChild(script);

  // Failsafe: guards against the loading screen getting stuck if caching stalls (e.g. a
  // hung fetch) or an onload/onerror event fails to fire in some Android WebView. Set well
  // above any realistic caching time so it never cuts off a legitimate first-time download.
  setTimeout(() => {
    const stuckLoading = document.getElementById("loadingScreen");
    if (stuckLoading && stuckLoading.style.display !== "none") {
      console.warn("GDL: Loading screen failsafe triggered after 60s for " + bookName);
      stuckLoading.style.display = "none";
    }
  }, 60000);
}



