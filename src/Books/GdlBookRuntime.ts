import { registerServiceWorkerUpdates } from "@curiouslearning/sw";
import { handleLoadingMessage, firebaseAnalyticsManager, appName, appVersion, readLanguageDataFromCacheAndNotifyAndroidApp } from "../../App";
import { campaignId, campaignSource, crUserId } from "../common";

let loadingScreen = document.getElementById("loadingScreen");
const gdlBroadcastChannel = new BroadcastChannel("cr-message-channel");

/**
 * Register the service worker and start caching for a GDL book.
 * This mirrors the CR path but uses a different asset description.
 */
async function registerServiceWorkerForGdl(config: {
  bookName: string;
  gdlId: string;
  basePath: string;
  contentFile: string;
}) {
  loadingScreen = loadingScreen || document.getElementById("loadingScreen");
  if ("serviceWorker" in navigator) {
    try {
      await registerServiceWorkerUpdates({
        swUrl: '/sw.js',
        mode: 'confirm',
      });

      await navigator.serviceWorker.ready;

      if (localStorage.getItem(config.bookName) == null && navigator.onLine) {
        if (loadingScreen) loadingScreen.style.display = "flex";
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
      } else {
        if (loadingScreen) loadingScreen.style.display = "none";
      }

      gdlBroadcastChannel.onmessage = (event) => {
        console.log(event.data.command);
        if (event.data.command == "CachingProgress") {
          let progressValue = parseInt(event.data.data.progress);
          handleLoadingMessage(event, progressValue);
        }
      };
    } catch (error) {
      console.log("Error Registering Service Worker for GDL", error);
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }
    }
  } else {
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
  }
}

/**
 * Initialize GDL book by registering SW caching and dynamically loading CSS and UMD JS files
 * @param bookName The book name (should start with "gdl-")
 */
/**
 * Enforce landscape mode through Android bridge call (same as CR books)
 */
function enforceLandscapeMode(): void {
  // Attempt to enforce landscape mode through Android bridge call
  // @ts-ignore
  if (window.Android && typeof window.Android.setContainerAppOrientation === "function") {
    //@ts-ignore
    window.Android.setContainerAppOrientation("landscape");
  }
}

export async function initializeGdlBook(bookName: string): Promise<void> {
  const gdlId = bookName.substring(4); // Remove "gdl-" prefix
  console.log("Initializing GDL book: " + gdlId);

  loadingScreen = loadingScreen || document.getElementById("loadingScreen");

  // Enforce landscape mode (same as CR books)
  enforceLandscapeMode();

  // Notify Android app if content is cached
  readLanguageDataFromCacheAndNotifyAndroidApp(bookName);

  // If already cached or offline, hide loading screen immediately
  if (localStorage.getItem(bookName) !== null || !navigator.onLine) {
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
  }

  // Log session start for GDL books (same as CR books)
  firebaseAnalyticsManager.logSessionStartWithPayload({
    app: appName,
    version: appVersion,
    cr_user_id: crUserId,
    source: campaignSource,
    campaignId: campaignId,
    book_name: bookName
  });

  const basePath = `/interactive-book-static/${gdlId}/`;
  const contentFile = `${basePath}content.json`;

  // Register service worker and start caching GDL assets
  await registerServiceWorkerForGdl({
    bookName,
    gdlId,
    basePath,
    contentFile,
  });

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

      // Insert the player before the loading screen if present, otherwise append to body.
      const loading = document.getElementById("loadingScreen");
      if (loading && loading.parentElement) {
        loading.parentElement.insertBefore(player, loading);
      } else {
        document.body.appendChild(player);
      }
    } else {
      (player as HTMLElement).id = gdlId;
    }

    // Hide loading screen once the player script is loaded
    if (localStorage.getItem(bookName) !== null || !navigator.onLine) {
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }
    }

    console.log("GDL book loaded successfully: " + gdlId);
  };
  script.onerror = () => {
    console.error("Failed to load GDL book script: " + gdlId);
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
  };
  document.body.appendChild(script);
}


