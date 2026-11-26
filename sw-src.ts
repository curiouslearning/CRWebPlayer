/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: any;
};

import { precacheAndRoute } from 'workbox-precaching';
import { registerUpdateNotifier, cacheUrlsWithProgress } from '@curiouslearning/sw';

precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^book/, /^cr_user_id/],
  exclude: [/^lang\//],
} as any);

registerUpdateNotifier();

const channel = new BroadcastChannel("cr-message-channel");
let version = 1.8;

const AUDIO_REGEX = /\.(mp3|wav|ogg|m4a)$/i;
const IMAGE_REGEX = /\.(png|jpe?g|webp|gif|svg|lottie)$/i;
const ASSET_REGEX = /\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a|lottie)$/i;

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

// Install and Activate are handled automatically by workbox + registerUpdateNotifier

// The manual updatefound listener is handled by registerUpdateNotifier

// Force the new service worker to activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Serve cached assets when offline or falling back to the network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request).catch(error => {
        console.error("Fetch failed in service worker:", error);
        throw error;
      });
    })
  );
});

let cachingInProgress = false;

async function cacheTheBookJSONAndImages(data: any) {
  console.log("Caching the book JSON and images");
  const bookData = data.bookData;
  const contentBasePath = `/BookContent/${bookData.bookName}/content/`;
  const bookAudioAndImageFiles = [];

  for (let i = 0; i < bookData.pages.length; i++) {
    const page = bookData.pages[i];
    for (let j = 0; j < page.visualElements.length; j++) {
      const visualElement = page.visualElements[j];
      if (visualElement.type === "audio") {
        bookAudioAndImageFiles.push(`${contentBasePath}${visualElement.audioSrc}`);
        for (let k = 0; k < visualElement.audioTimestamps.timestamps.length; k++) {
          bookAudioAndImageFiles.push(
            `${contentBasePath}${visualElement.audioTimestamps.timestamps[k].audioSrc}`
          );
        }
      } else if (
        visualElement.type === "image" &&
        visualElement.imageSource !== "empty_glow_image"
      ) {
        bookAudioAndImageFiles.push(`${contentBasePath}${visualElement.imageSource}`);
      }
    }
  }

  bookAudioAndImageFiles.push(data.contentFile);

  console.log("Book audio files: ", bookAudioAndImageFiles);

  if (!cachingInProgress) {
    cachingInProgress = true;
    try {
      await cacheBookAssets(bookData, bookAudioAndImageFiles);
    } finally {
      cachingInProgress = false;
    }
  }
}

/**
 * Extract filename from a path and map to local GDL book structure.
 * Maps server-absolute paths to local structure: assets/ for images/lottie, audio/ for mp3.
 */
function mapGdlPathToLocal(serverPath: any, basePath: any) {
  if (!serverPath || typeof serverPath !== "string") return null;

  // Extract just the filename (last part after last /)
  const filename = serverPath.split("/").pop();

  // Validate filename - must have a name before the extension
  if (!filename || filename.startsWith(".") || filename.length < 3) return null;

  // Determine directory based on file extension
  if (AUDIO_REGEX.test(filename)) {
    return basePath + "audio/" + filename;
  } else if (IMAGE_REGEX.test(filename)) {
    return basePath + "assets/" + filename;
  }

  return null;
}

/**
 * Recursively walk a JSON object and collect asset-like string values.
 * Specifically handles GDL content.json structure with paths, mp3, lottie files, etc.
 */
function collectAssetsFromJson(node: any, assets: any, basePath: any) {
  if (!node) return;

  // Known fields that contain asset paths in GDL structure
  const assetPathFields = ['path', 'mp3', 'url', 'filename', 'image'];

  // Fields to skip entirely during recursive traversal (display names, error messages, etc.)
  const skipFields = ['name', 'error', 'title', 'description', 'text', 'alt', 'transcription'];

  if (typeof node === "string") {
    if (ASSET_REGEX.test(node)) {
      // Skip invalid filenames (like .lottie without name)
      const filename = node.split("/").pop();
      if (!filename || filename.startsWith(".") || filename.length < 3) {
        return;
      }

      // Handle absolute URLs
      if (node.startsWith("http://") || node.startsWith("https://")) {
        assets.add(node);
      }
      // Handle absolute paths starting with / - map to local structure
      else if (node.startsWith("/")) {
        // Map server-absolute paths to local GDL book structure
        const localPath = mapGdlPathToLocal(node, basePath);
        if (localPath) {
          assets.add(localPath);
        }
        // Don't add fallback - if mapping fails, the path is invalid
      }
      // Handle relative paths
      else {
        assets.add(basePath + node);
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectAssetsFromJson(item, assets, basePath);
    }
    return;
  }

  if (typeof node === "object") {
    // Handle special cases for GDL structure first
    // Credits logos array - these are filenames that need to be resolved
    if (node.logos && Array.isArray(node.logos)) {
      for (const logo of node.logos) {
        if (typeof logo === "string") {
          // Logo filenames might not have extensions, try common image extensions
          // Check if logo already has an extension
          if (!IMAGE_REGEX.test(logo)) {
            assets.add(basePath + "assets/" + logo + ".jpg");
          } else {
            assets.add(basePath + "assets/" + logo);
          }
        }
      }
    }

    // Check for known asset path fields - prefer 'path' over 'url' if both exist
    // Process 'path' first, then other fields, but skip 'url' and 'filename' if 'path' exists
    const hasPath = node.path && typeof node.path === "string" && ASSET_REGEX.test(node.path);

    for (const field of assetPathFields) {
      // Skip 'url' and 'filename' if 'path' exists (to avoid duplicates)
      // 'path' is the most reliable field in GDL structure
      if (hasPath && (field === "url" || field === "filename")) continue;

      if (node[field] && typeof node[field] === "string") {
        const value = node[field];
        if (ASSET_REGEX.test(value)) {
          if (value.startsWith("http://") || value.startsWith("https://")) {
            assets.add(value);
          } else if (value.startsWith("/")) {
            // Map server-absolute paths to local GDL book structure
            const localPath = mapGdlPathToLocal(value, basePath);
            if (localPath) {
              assets.add(localPath);
            }
            // Don't add fallback - if mapping fails, the path is invalid
          } else {
            // Relative paths (bare filenames like "Sad-bee.lottie" or "abc.mp3")
            // Route into the correct subdirectory based on extension
            const localPath = mapGdlPathToLocal(value, basePath);
            if (localPath) {
              assets.add(localPath);
            } else {
              // Non-audio/image relative path - prepend basePath directly
              assets.add(basePath + value);
            }
          }
        }
      }
    }

    // Recursively process all fields EXCEPT the ones we've already processed
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        // Skip fields we've already processed to avoid duplicates
        if (key === "logos" || assetPathFields.includes(key)) {
          continue;
        }
        // Skip display-only and non-asset fields to avoid false positives
        if (skipFields.includes(key)) {
          continue;
        }
        // Recursively process everything else
        collectAssetsFromJson(node[key], assets, basePath);
      }
    }
  }
}

/**
 * Build and cache the asset list for a GDL book.
 * Expects data: { bookName, gdlId, basePath, contentFile, ... }
 */
async function cacheGdlBookAssets(data: any) {
  console.log("Caching GDL book assets");

  const bookName = data.bookName || data.gdlId;
  const basePath = data.basePath || "/";
  const contentFile = data.contentFile;

  const assetsSet = new Set<string>();

  // Always cache the core GDL assets
  if (contentFile) {
    assetsSet.add(contentFile);
  }
  assetsSet.add(basePath + "my-lib-style.css");
  assetsSet.add(basePath + "gdlplayer.umd.js");

  // Cache the dotlottie WASM needed for Lottie animations to work offline.
  // The gdlplayer loads this from CDN; we must pre-cache it here.
  const DOTLOTTIE_VERSION = "0.44.0";
  assetsSet.add(`https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@${DOTLOTTIE_VERSION}/dist/dotlottie-player.wasm`);

  // Cache the Quicksand font expected at the root by gdlplayer.umd.js.
  // The player injects: @font-face { src: url("/Quicksand-Bold.ttf") }
  assetsSet.add("/Quicksand-Bold.ttf");

  // Try to fetch and inspect the GDL content.json for additional assets
  if (contentFile) {
    try {
      const response = await fetch(contentFile);
      if (response.ok) {
        const json = await response.json();
        console.log("Parsing GDL content.json for assets...");
        collectAssetsFromJson(json, assetsSet, basePath);
        console.log("Found " + assetsSet.size + " total assets after parsing content.json");
      } else {
        console.log("Failed to fetch GDL content.json", response.status);
      }
    } catch (error) {
      console.log("Error while fetching GDL content.json", error);
    }
  }

  // Filter out invalid paths and deduplicate by normalizing to correct structure
  const validAssets = new Set<string>();
  for (const asset of assetsSet) {
    // Skip invalid paths (like .lottie without filename)
    if (asset.endsWith("/.lottie") || asset.endsWith("/.jpg") || asset.endsWith("/.mp3")) {
      continue;
    }

    // Normalize paths - if it's in the wrong location, try to fix it
    // Files should be in assets/ or audio/, not directly in basePath
    if (asset.startsWith(basePath) && !asset.includes("/assets/") && !asset.includes("/audio/")) {
      const filename = asset.split("/").pop();
      if (filename) {
        // Determine correct directory based on extension
        if (AUDIO_REGEX.test(filename)) {
          validAssets.add(basePath + "audio/" + filename);
        } else if (IMAGE_REGEX.test(filename)) {
          validAssets.add(basePath + "assets/" + filename);
        } else {
          // Keep as-is for other files (like content.json, .css, .js)
          validAssets.add(asset);
        }
      }
    } else {
      // Already in correct location or is a core file
      validAssets.add(asset);
    }
  }

  const assetArray = Array.from(validAssets);

  console.log("GDL assets to cache (" + assetArray.length + " total, filtered from " + assetsSet.size + "): ", assetArray);

  if (!cachingInProgress) {
    cachingInProgress = true;
    try {
      await cacheBookAssets({ bookName: bookName }, assetArray);
    } finally {
      cachingInProgress = false;
    }
  }
}

class HttpStatusError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

/**
 * Statuses meaning the file doesn't exist on the server (S3 answers 403 for missing keys).
 * Retrying won't help, so these don't block the book from being marked downloaded;
 * the book then behaves offline exactly as it does online. Anything else (network
 * failure, 5xx, timeout) is treated as transient and does block it, so it's retried.
 */
const PERMANENTLY_MISSING_STATUSES = [403, 404, 410];

/**
 * Wraps a Cache so that put() rejects HTTP error responses (404, 503, ...) instead of
 * storing them. cacheUrlsWithProgress stores whatever fetch() returns, so without this an
 * error page would be saved in place of the asset and served forever after.
 * A rejected put() surfaces through cacheUrlsWithProgress's onItemError like a network failure.
 */
function rejectingErrorResponses(cache: Cache): Cache {
  return new Proxy(cache, {
    get(target, prop) {
      if (prop === "put") {
        return async (request: RequestInfo | URL, response: Response) => {
          if (!response.ok) {
            // Drop an error response saved by an earlier (pre-fix) download, but keep a good copy.
            const existing = await target.match(request);
            if (existing && !existing.ok) {
              await target.delete(request);
            }
            throw new HttpStatusError(response.status, String(request));
          }
          return target.put(request, response);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function postCachingProgress(data: { progress: number; bookName: string; complete?: boolean; failedCount?: number }) {
  const clients = await self.clients.matchAll();
  if (clients.length > 0) {
    channel.postMessage({ command: "CachingProgress", data });
  }
}

/**
 * Files that are always downloaded again, even if a copy is already cached: the book's
 * content.json and the GDL player's script/stylesheet. They keep their name when a book or
 * the player is updated, so reusing a copy left by an earlier, interrupted attempt could mix
 * an old content.json or player with new assets.
 */
function alwaysRefetch(url: string): boolean {
  return /(^|\/)content\.json$|\.(js|css)$/i.test(url);
}

/**
 * Returns the URLs that still need downloading: those not already cached with an OK response
 * (left by an earlier, interrupted attempt), plus everything alwaysRefetch() matches.
 * This is what makes a retry resume instead of downloading the whole book again,
 * which matters on slow connections and small data plans.
 */
async function urlsStillToCache(cache: Cache, urls: string[]): Promise<string[]> {
  const needed: string[] = [];
  for (const url of urls) {
    if (alwaysRefetch(url)) {
      needed.push(url);
      continue;
    }
    const cached = await cache.match(url);
    if (!cached || !cached.ok) {
      needed.push(url);
    }
  }
  return needed;
}

/**
 * Caches every URL not already cached, then reports 100% with `complete: true` only if no
 * file failed for a transient reason (see PERMANENTLY_MISSING_STATUSES). The page marks the
 * book as downloaded only on `complete: true`, so a download cut short (offline, flaky
 * network, server errors) is resumed the next time the book is opened online.
 */
async function cacheBookAssets(bookData: any, bookAudioAndImageFiles: any) {
  const bookName = bookData.bookName;
  const failedUrls: string[] = [];
  const missingUrls: string[] = [];
  try {
    const rawCache = await caches.open(bookName);
    const allUrls: string[] = Array.from(new Set<string>(bookAudioAndImageFiles));
    const toFetch = await urlsStillToCache(rawCache, allUrls);
    const alreadyCached = allUrls.length - toFetch.length;
    if (alreadyCached > 0) {
      console.log(`Book "${bookName}": resuming, ${alreadyCached} of ${allUrls.length} file(s) already cached`);
    }

    await cacheUrlsWithProgress(rejectingErrorResponses(rawCache), toFetch, {
      batchSize: 5,
      delayBetweenBatchesMs: 100,
      onProgress: (progress) => {
        // Report progress over the whole book, so the bar continues from where the last attempt stopped.
        const overall = ((alreadyCached + (progress / 100) * toFetch.length) / allUrls.length) * 100;
        // The final 100% is sent below, once we know whether every file was saved.
        if (overall < 100) {
          postCachingProgress({ progress: Math.round(overall), bookName });
        }
      },
      onItemError: (url, error) => {
        if (error instanceof HttpStatusError && PERMANENTLY_MISSING_STATUSES.includes(error.status)) {
          missingUrls.push(url);
          console.warn(`Asset not found on server (HTTP ${error.status}), skipping:`, url);
        } else {
          failedUrls.push(url);
          console.log("Failed to cache asset:", url, error);
        }
      }
    });
  } catch (error) {
    console.error("Unhandled error in cacheBookAssets:", error);
    failedUrls.push("(cacheBookAssets aborted)");
  }

  const complete = failedUrls.length === 0;
  if (!complete) {
    console.warn(`Book "${bookName}" not fully cached: ${failedUrls.length} file(s) failed`, failedUrls);
  }
  if (missingUrls.length > 0) {
    console.warn(`Book "${bookName}" references ${missingUrls.length} file(s) missing on the server`, missingUrls);
  }
  await postCachingProgress({ progress: 100, bookName, complete, failedCount: failedUrls.length });
}
