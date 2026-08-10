#!/usr/bin/env node
// Post-webpack-build step: takes the webpack-bundled service worker source
// (dist/sw-src.js -- produced by the 'sw-src' entry in webpack.config.js,
// which resolves sw-src.ts's @curiouslearning/sw / workbox-* npm imports)
// and injects the precache manifest into it, writing the final sw.js to the
// repo root (where it must live so its scope covers the whole site --
// BookContent/, interactive-book-static/, etc. -- not just /dist/).
//
// workbox-build's Node injectManifest() only does a literal text
// substitution of self.__WB_MANIFEST; it does not bundle npm imports itself,
// which is why the webpack build has to happen first. See
// specs/001-interactive-books-sw-package/research.md §1.
//
// (We use workbox-build's Node API directly here, not workbox-webpack-plugin's
// InjectManifest, because that plugin's runtime option validation rejects
// globDirectory/globPatterns/globIgnores despite them appearing in its merged
// TypeScript type -- confirmed empirically, not just inferred from the .d.ts.)

const path = require("path");

// @curiouslearning/sw's single bundled CJS entry point evaluates all of its
// exports together, including registerUpdateNotifier/registerServiceWorkerUpdates,
// which pull in workbox-core's logger -- and that logger unconditionally reads
// `self` at module-evaluation time, a browser/worker-only global that doesn't
// exist in this plain Node script. This is a known category of Node-interop
// issue with workbox-core's logger; polyfilling `self` before the require
// (only so createInjectManifestOptions, itself pure/synchronous, can be
// imported here) is the standard remedy.
if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}

const { injectManifest } = require("workbox-build");
const { createInjectManifestOptions } = require("@curiouslearning/sw");

const repoRoot = path.resolve(__dirname, "..");

const config = createInjectManifestOptions({
  swSrc: path.join(repoRoot, "dist", "sw-src.js"),
  swDest: path.join(repoRoot, "sw.js"),
  globDirectory: repoRoot,
  globPatterns: ["**/*.{wav,mp3,WAV,gif,png,webp,otf,jpg,js,json,css,html}"],
  globIgnores: [
    "dist/index.html",
    "dist/sw-src.js",
    "dist/sw-src.js.map",
    "BookContent/**/*",
    "interactive-book-static/**/*",
    "GDLBookContent/**/*",
    "node_modules/**/*",
    "scripts/**/*",
    "sw-src.ts",
    "tsconfig.json",
    "webpack.config.js",
    "jest.config.js",
    "package.json",
    "package-lock.json",
    "README.md",
    // Stale, unreferenced local Workbox runtime copy left over from a 2023
    // CDN-vs-local experiment (predates this repo's current importScripts-CDN
    // approach); workbox-config.js excluded it too -- not in scope to delete
    // as part of this feature, just preserving the existing exclusion.
    "workbox-7f917042.js",
    "workbox-7f917042.js.map",
  ],
});

injectManifest(config)
  .then(({ count, size, warnings }) => {
    warnings.forEach((warning) => console.warn(warning));
    console.log(`sw.js generated: ${count} files, ${size} bytes will be precached.`);
  })
  .catch((error) => {
    console.error("Failed to inject the precache manifest into sw.js:", error);
    process.exit(1);
  });
