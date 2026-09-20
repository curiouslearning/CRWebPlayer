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

  // Load UMD JS dynamically
  const script = document.createElement("script");
  script.src = `${basePath}gdlplayer.umd.js`;

  script.onload = () => {
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



