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

  // If the book is already cached, hide the loading screen immediately before anything else
  const isCached = localStorage.getItem(bookName) !== null;
  if (isCached) {
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
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

  // Set up progress listener BEFORE caching messages arrive
  gdlBroadcastChannel.onmessage = (event) => {
    console.log(event.data.command);
    if (event.data.command == "CachingProgress") {
      const progressValue = parseInt(event.data.data.progress);
      handleLoadingMessage(event, progressValue);
    }
  };

  // Show loading screen only if this is the first time (not cached yet)
  if (!isCached) {
    if (loadingScreen) {
      loadingScreen.style.display = "flex";
    }
  }

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

    // Always hide the loading screen when the player script has finished loading.
    // For already-cached books: removes the loading screen immediately.
    // For first-time downloads: the script loads while caching may still be in
    // progress; hiding here is safe because the GDL player manages its own
    // internal loading indicator.
    const currentLoading = document.getElementById("loadingScreen");
    if (currentLoading) {
      currentLoading.style.display = "none";
    }

    console.log("GDL book loaded successfully: " + gdlId);
  };

  script.onerror = () => {
    console.error("Failed to load GDL book script: " + gdlId);
    const currentLoading = document.getElementById("loadingScreen");
    if (currentLoading) {
      currentLoading.style.display = "none";
    }
  };

  document.body.appendChild(script);

  // Failsafe: script.onload/onerror can fail to fire in some Android WebViews (e.g. when
  // a request is blocked or intercepted at the native layer without an error event
  // propagating to the DOM). If the loading screen is still visible after 8s, force it
  // hidden so the user is never left permanently stuck — the gdl-player element manages
  // its own internal loading state independently of this overlay.
  setTimeout(() => {
    const stuckLoading = document.getElementById("loadingScreen");
    if (stuckLoading && stuckLoading.style.display !== "none") {
      console.warn("GDL: Loading screen failsafe triggered after 8s for " + bookName);
      stuckLoading.style.display = "none";
    }
  }, 8000);
}



