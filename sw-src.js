importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.2.0/workbox-sw.js"
);

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^book/, /^cr_user_id/],
  exclude: [/^lang\//],
});

const channel = new BroadcastChannel("cr-message-channel");
let version = 1.6;
// let cachingProgress = 0;
// let cachableAssetsCount = 0;

channel.addEventListener("message", async function (event) {
  if (event.data.command === "Cache") {
    console.log("Caching request received in the service worker with data: ");
    console.log(event.data);
    cachingProgress = 0;
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

self.registration.addEventListener("updatefound", function (e) {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      if (cacheName == workbox.core.cacheNames.precache) {
        channel.postMessage({ command: "UpdateFound", data: {} });
      }
    });
  });
});

// Serve cached assets when offline or falling back to the network
self.addEventListener("fetch", (event) => {
  // const requestURL = new URL(event.request.url);
  // if (requestURL.protocol === 'chrome-extension:') {
  //   return;
  // }

  // if (requestURL.origin === self.location.origin) {
  //   event.respondWith(
  //     caches.match(event.request).then((response) => {
  //         // If the asset is in the static cache, return it
  //         if (response) {
  //           return response;
  //         }

  //         // If not in the static cache, fetch it from the network
  //         return fetch(event.request).then((networkResponse) => {
  //         // Cache a copy of the response in the static cache for future use

  //         return networkResponse;
  //       });
  //     })
  //   );
  // } else {
  // For requests to the BookContent folder, use the Book Content cache
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
  // }
});

var cachingInProgress = false;

async function cacheTheBookJSONAndImages(data) {
  console.log("Caching the book JSON and images");
  let bookData = data["bookData"];
  let bookAudioAndImageFiles = [];

  for (let i = 0; i < bookData["pages"].length; i++) {
    let page = bookData["pages"][i];
    for (let j = 0; j < page["visualElements"].length; j++) {
      let visualElement = page["visualElements"][j];
      if (visualElement["type"] === "audio") {
        bookAudioAndImageFiles.push(
          `/BookContent/${data["bookData"]["bookName"]}/content/` +
            visualElement["audioSrc"]
        );
        for (
          let k = 0;
          k < visualElement["audioTimestamps"]["timestamps"].length;
          k++
        ) {
          bookAudioAndImageFiles.push(
            `/BookContent/${data["bookData"]["bookName"]}/content/` +
              visualElement["audioTimestamps"]["timestamps"][k]["audioSrc"]
          );
        }
      } else if (
        visualElement["type"] === "image" &&
        visualElement["imageSource"] !== "empty_glow_image"
      ) {
        bookAudioAndImageFiles.push(
          `/BookContent/${data["bookData"]["bookName"]}/content/` +
            visualElement["imageSource"]
        );
      }
    }
  }

  bookAudioAndImageFiles.push(data["contentFile"]);

  console.log("Book audio files: ", bookAudioAndImageFiles);

  if (!cachingInProgress) {
    cachingInProgress = true;
    await cacheBookAssets(bookData, bookAudioAndImageFiles);
    cachingInProgress = false;
  }
}

/**
 * Extract filename from a path and map to local GDL book structure.
 * Maps server-absolute paths to local structure: assets/ for images/lottie, audio/ for mp3.
 */
function mapGdlPathToLocal(serverPath, basePath) {
  if (!serverPath || typeof serverPath !== "string") return null;
  
  // Extract just the filename (last part after last /)
  const filename = serverPath.split("/").pop();
  
  // Validate filename - must have a name before the extension
  if (!filename || filename.startsWith(".") || filename.length < 3) return null;
  
  // Determine directory based on file extension
  if (/\.(mp3|wav|ogg|m4a)$/i.test(filename)) {
    // Audio files go in audio/ directory
    return basePath + "audio/" + filename;
  } else if (/\.(png|jpe?g|webp|gif|svg|lottie)$/i.test(filename)) {
    // Images and lottie files go in assets/ directory
    return basePath + "assets/" + filename;
  }
  
  return null;
}

/**
 * Recursively walk a JSON object and collect asset-like string values.
 * Specifically handles GDL content.json structure with paths, mp3, lottie files, etc.
 */
function collectAssetsFromJson(node, assets, basePath) {
  if (!node) return;

  // Extended regex to include lottie files and other asset types
  const assetRegex = /\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a|lottie)$/i;
  
  // Known fields that contain asset paths in GDL structure
  const assetPathFields = ['path', 'mp3', 'url', 'filename', 'image'];

  if (typeof node === "string") {
    // Check if it's an asset file
    if (assetRegex.test(node)) {
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
          if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(logo)) {
            assets.add(basePath + "assets/" + logo + ".jpg");
          } else {
            assets.add(basePath + "assets/" + logo);
          }
        }
      }
    }
    
    // Check for known asset path fields - prefer 'path' over 'url' if both exist
    // Process 'path' first, then other fields, but skip 'url' and 'filename' if 'path' exists
    const hasPath = node.path && typeof node.path === "string" && assetRegex.test(node.path);
    
    for (const field of assetPathFields) {
      // Skip 'url' and 'filename' if 'path' exists (to avoid duplicates)
      // 'path' is the most reliable field in GDL structure
      if (hasPath && (field === "url" || field === "filename")) continue;
      
      if (node[field] && typeof node[field] === "string") {
        const value = node[field];
        if (assetRegex.test(value)) {
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
            // Relative paths - prepend basePath
            assets.add(basePath + value);
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
async function cacheGdlBookAssets(data) {
  console.log("Caching GDL book assets");

  const bookName = data.bookName || data.gdlId;
  const basePath = data.basePath || "/";
  const contentFile = data.contentFile;

  const assetsSet = new Set();

  // Always cache the core GDL assets
  if (contentFile) {
    assetsSet.add(contentFile);
  }
  assetsSet.add(basePath + "my-lib-style.css");
  assetsSet.add(basePath + "gdlplayer.umd.js");

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
  const validAssets = new Set();
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
        if (/\.(mp3|wav|ogg|m4a)$/i.test(filename)) {
          validAssets.add(basePath + "audio/" + filename);
        } else if (/\.(png|jpe?g|webp|gif|svg|lottie)$/i.test(filename)) {
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
    await cacheBookAssets({ bookName: bookName }, assetArray);
    cachingInProgress = false;
  }
}

async function cacheBookAssets(bookData, bookAudioAndImageFiles) {
  const cache = await caches.open(bookData["bookName"]);
  const batchSize = 5; // Process in batches of 5
  let cachingProgress = 0;

  for (let i = 0; i < bookAudioAndImageFiles.length; i += batchSize) {
    const batch = bookAudioAndImageFiles.slice(i, i + batchSize);

    try {
      await Promise.all(batch.map(file => cache.add(file)));
    } catch (error) {
      // Best-effort caching: some assets referenced in content.json might not exist locally.
      // Try each file individually and silently skip ones that fail, so caching can continue.
      for (const file of batch) {
        try {
          await cache.add(file);
        } catch (fileError) {
          // Optional: log at a low level for debugging, but don't treat as a hard error.
          // console.log("Skipping missing or unreachable asset:", file);
        }
      }
    }

    // Whether or not all files in the batch were cached successfully, count the batch as processed
    // so that progress can eventually reach 100% even if some assets are missing.
    cachingProgress += batch.length;

    // Send progress update after each batch
    const progress = Math.round((cachingProgress / bookAudioAndImageFiles.length) * 100);
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      await channel.postMessage({
        command: "CachingProgress",
        data: { progress, bookName: bookData["bookName"] },
      });
    }

    // Introduce a small delay between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
