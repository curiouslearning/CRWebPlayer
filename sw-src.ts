import { precacheAndRoute, PrecacheEntry } from "workbox-precaching";
import { registerUpdateNotifier, cacheUrlsWithProgress } from "@curiouslearning/sw";
import { buildCrAssetList, buildGdlAssetList } from "./src/ServiceWorker/assetManifest";

// Standard Workbox+TypeScript boilerplate: narrow `self` to the actual
// service worker global scope (plus the injected precache manifest global)
// for this file, overriding the ambient `dom`/`webworker` lib self typing.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^book/, /^cr_user_id/],
});

// Registers the shared update-notification lifecycle fix: broadcasts on its
// own channel (not "cr-message-channel") only once this worker has actually
// claimed clients, replacing the app's previous premature `updatefound`
// broadcast. See specs/001-interactive-books-sw-package/research.md §1 and §3.
registerUpdateNotifier();

const channel = new BroadcastChannel("cr-message-channel");
let version = 1.6;

channel.addEventListener("message", async function (event) {
  if (event.data.command === "Cache") {
    console.log("Caching request received in the service worker with data: ", event.data);
    const data = event.data.data;

    // Route to appropriate caching logic based on book type / prefix
    if (data && (data.type === "gdl" || (data.bookName && data.bookName.startsWith("gdl-")))) {
      cacheGdlBookAssets(data);
    } else {
      cacheTheBookJSONAndImages(data);
    }
  }
});

// Precache static assets during service worker installation
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service worker activated");
  event.waitUntil(self.clients.claim());
  channel.postMessage({ command: "Activated", data: {} });
  return self.clients.claim();
});

// Serve cached assets when offline or falling back to the network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

let cachingInProgress = false;

async function cacheTheBookJSONAndImages(data) {
  console.log("Caching the book JSON and images");
  const bookData = data.bookData;

  // Pure asset-list building lives in ./src/ServiceWorker/assetManifest (unit-tested).
  const bookAudioAndImageFiles = buildCrAssetList(bookData, data.contentFile);

  console.log("Book audio files: ", bookAudioAndImageFiles);

  if (!cachingInProgress) {
    cachingInProgress = true;
    await cacheBookAssets(bookData, bookAudioAndImageFiles);
    cachingInProgress = false;
  }
}

/**
 * Build and cache the asset list for a GDL book.
 * Expects data: { bookName, gdlId, basePath, contentFile, ... }
 */
async function cacheGdlBookAssets(data) {
  console.log("Caching GDL book assets");

  const bookName = data.bookName || data.gdlId;
  const basePath = data.basePath || "/";
  const contentFile = data.contentFile;

  // Fetch and inspect the GDL content.json for additional assets (the pure
  // list-building/normalization lives in ./src/ServiceWorker/assetManifest).
  let contentJson = null;
  if (contentFile) {
    try {
      const response = await fetch(contentFile);
      if (response.ok) {
        contentJson = await response.json();
        console.log("Parsing GDL content.json for assets...");
      } else {
        console.log("Failed to fetch GDL content.json", response.status);
      }
    } catch (error) {
      console.log("Error while fetching GDL content.json", error);
    }
  }

  const assetArray = buildGdlAssetList(contentJson, basePath, contentFile);

  console.log("GDL assets to cache (" + assetArray.length + " total): ", assetArray);

  if (!cachingInProgress) {
    cachingInProgress = true;
    await cacheBookAssets({ bookName: bookName }, assetArray);
    cachingInProgress = false;
  }
}

async function cacheBookAssets(bookData, bookAudioAndImageFiles: string[]) {
  const cache = await caches.open(bookData.bookName);

  // Batched caching-with-progress is provided by the shared @curiouslearning/sw
  // package (see specs/001-interactive-books-sw-package/research.md §4) instead
  // of a hand-rolled loop. batchSize/delayBetweenBatchesMs match this app's
  // previous "5 files per batch, 100ms between batches" behavior; onProgress
  // preserves the existing "cr-message-channel" CachingProgress message shape
  // App.ts already expects, and onItemError preserves the previous best-effort,
  // skip-and-continue behavior for assets referenced in content.json that don't
  // actually exist locally.
  await cacheUrlsWithProgress(cache, bookAudioAndImageFiles, {
    batchSize: 5,
    delayBetweenBatchesMs: 100,
    onProgress: (progress) => {
      channel.postMessage({
        command: "CachingProgress",
        data: { progress: Math.round(progress), bookName: bookData.bookName },
      });
    },
    onItemError: (url, error) => {
      // Best-effort caching: some assets referenced in content.json might not
      // exist locally. Optional: log at a low level for debugging, but don't
      // treat as a hard error.
      // console.log("Skipping missing or unreachable asset:", url, error);
    },
  });
}
