// Pure asset-list-building logic for the service worker's book-caching flow,
// extracted from sw-src.ts so it can be unit-tested without a service-worker
// global scope (sw-src.ts itself runs SW side effects at import time:
// precacheAndRoute / registerUpdateNotifier / addEventListener). These
// functions do no I/O and touch no SW globals -- callers in sw-src.ts do the
// fetch()/caches.open()/cacheUrlsWithProgress() orchestration around them.

export const AUDIO_REGEX = /\.(mp3|wav|ogg|m4a)$/i;
export const IMAGE_REGEX = /\.(png|jpe?g|webp|gif|svg|lottie)$/i;
export const ASSET_REGEX = /\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a|lottie)$/i;

/**
 * Extract filename from a path and map to local GDL book structure.
 * Maps server-absolute paths to local structure: assets/ for images/lottie, audio/ for mp3.
 */
export function mapGdlPathToLocal(serverPath: string, basePath: string): string | null {
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
export function collectAssetsFromJson(node: any, assets: Set<string>, basePath: string): void {
  if (!node) return;

  // Known fields that contain asset paths in GDL structure
  const assetPathFields = ["path", "mp3", "url", "filename", "image"];

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
 * Build the ordered list of asset URLs to cache for a Curious Reader (H5P) book,
 * from its parsed bookData plus the content.json path. Pure -- no I/O.
 */
export function buildCrAssetList(bookData: any, contentFile: string): string[] {
  const contentBasePath = `/BookContent/${bookData.bookName}/content/`;
  const bookAudioAndImageFiles: string[] = [];

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

  bookAudioAndImageFiles.push(contentFile);

  return bookAudioAndImageFiles;
}

/**
 * Build the de-duplicated, normalized list of asset URLs to cache for a GDL
 * book, from its (already-fetched) content.json object plus base paths. Pure --
 * the caller is responsible for fetching content.json and passing it in as
 * `contentJson` (or null if it couldn't be fetched).
 */
export function buildGdlAssetList(
  contentJson: any,
  basePath: string,
  contentFile: string
): string[] {
  const assetsSet = new Set<string>();

  // Always cache the core GDL assets
  if (contentFile) {
    assetsSet.add(contentFile);
  }
  assetsSet.add(basePath + "my-lib-style.css");
  assetsSet.add(basePath + "gdlplayer.umd.js");

  if (contentJson) {
    collectAssetsFromJson(contentJson, assetsSet, basePath);
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

  return Array.from(validAssets);
}
