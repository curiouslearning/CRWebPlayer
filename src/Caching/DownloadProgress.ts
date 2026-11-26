// Page-side handling of the service worker's book download progress, shared by CR books
// (App.ts) and GDL books (GdlBookRuntime.ts). The download itself happens in the service
// worker (sw-src.ts); this module updates the loading screen, marks the book as downloaded,
// logs Firebase download milestones and tells the Android container the cached status.
// It stays on the page side because the service worker has no access to the DOM,
// localStorage or the window.Android bridge.
import { FirebaseAnalyticsManager } from "../Analytics/Firebase/FirebaseManager";
import { appName, appVersion, crUserId } from "../common";

let sessionStartTime: Date = new Date(); // Initialize at module load for both CR and GDL books
let logged25PercentDownload: boolean = false;
let logged50PercentDownload: boolean = false;
let logged75PercentDownload: boolean = false;
let logged100PercentDownload: boolean = false;

/**
 * Restart the clock that download events report as ms_since_session_start.
 * Called when a CR book session starts.
 */
export function resetDownloadSessionStart(): void {
  sessionStartTime = new Date();
}

/**
 * Handle a "CachingProgress" message from the service worker.
 * @param event The BroadcastChannel message event
 * @param progressValue The download progress, 0-100
 */
export function handleLoadingMessage(event: any, progressValue: any): void {
  let progressBar = document.getElementById("progressBar");
  if (progressValue < 100) {
    progressBar!.style.width = progressValue + "%";
  }

  if (progressValue >= 25 && !logged25PercentDownload) {
    logged25PercentDownload = true;
    logDownloadProgressWithPayloadToFirebase("download_25", event.data.data.bookName);
  }

  if (progressValue >= 50 && !logged50PercentDownload) {
    logged50PercentDownload = true;
    logDownloadProgressWithPayloadToFirebase("download_50", event.data.data.bookName);
  }

  if (progressValue >= 75 && !logged75PercentDownload) {
    logged75PercentDownload = true;
    logDownloadProgressWithPayloadToFirebase("download_75", event.data.data.bookName);
  }

  if (progressValue >= 100) {
    document.getElementById("loadingScreen")!.style.display = "none";
    // Only mark the book as downloaded if the service worker saved every file. Otherwise
    // leave the flag unset so the next online open downloads the book again.
    if (event.data.data.complete === true) {
      if (!logged100PercentDownload) {
        logged100PercentDownload = true;
        logDownloadProgressWithPayloadToFirebase("download_completed", event.data.data.bookName);
      }
      localStorage.setItem(event.data.data.bookName, "true");
    } else {
      console.warn(
        `Book "${event.data.data.bookName}" download incomplete (${event.data.data.failedCount ?? "unknown"} file(s) failed); will retry on next online open`
      );
    }
    readLanguageDataFromCacheAndNotifyAndroidApp(event.data.data.bookName);
  }
}

/**
 * Log download progress with payload
 * @param eventName Name of the event to log
 * @param bookName Name of the book being downloaded
 */
export function logDownloadProgressWithPayloadToFirebase(eventName: string, bookName: string): void {
  // Ensure sessionStartTime is initialized (fallback if somehow undefined)
  if (!sessionStartTime) {
    sessionStartTime = new Date();
  }
  let timeSpent = new Date().getTime() - sessionStartTime.getTime();
  FirebaseAnalyticsManager.getInstance().logDownloadProgressWithPayload(eventName, {
    app: appName,
    version: appVersion,
    book_name: bookName,
    cr_user_id: crUserId,
    ms_since_session_start: timeSpent,
  });
}

export function readLanguageDataFromCacheAndNotifyAndroidApp(bookName: string) {
  try {
    //@ts-ignore
    if (window.Android) {
      let isContentCached: boolean = localStorage.getItem(bookName) !== null;
      //@ts-ignore
      window.Android.cachedStatus(isContentCached);
    }
  } catch (error) {
    console.error("Error notifying Android bridge of cached status:", error);
  }
}
