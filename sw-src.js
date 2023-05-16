importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");
// importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-routing.dev.js");
// importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-strategies.dev.js");

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST, {});

let cachingProgress = 0;

self.addEventListener("install", async function (e) {
  self.addEventListener("message", async (event) => {
    // if (event.data.type === "Registration") {
    //   if (!!!caches.keys().length) {
    //     let cacheName = await getCacheName(event.data.value);
    //   }
    // }
  });
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service worker activated");
  event.waitUntil(self.clients.claim());
});

const channel = new BroadcastChannel("my-channel");

channel.addEventListener("message", async function (event) {
  console.log("Caching request received on the service worker!");
  if (event.data.command === "Cache") {
    cachingProgress = 0;
    await cacheTheBookJSONAndImages(event.data.data.content);
  }
});

function cacheTheBookJSONAndImages(contentFilePath) {
  console.log("Caching the book JSON and images" + contentFilePath);
  self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
          client.postMessage({
              msg: "Loading",
              data: 100,
          })
      );
  });
}

self.addEventListener("fetch", function (event) {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol === 'chrome-extension:') {
    return;
  }
  console.log("Fetch event for ", event.request.url);
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request).then((response) => {
        const clonedResponse = response.clone();
        const requestString = event.request.url.toLowerCase();
        // If the response is valid, clone it and store it in the cache
        if (response.ok) {
          if (requestString.indexOf('bookcontent') !== -1) {
            console.log('Book content request');
            const segments = requestString.split('/');
            const index = segments.indexOf('bookcontent');
            if (index !== -1 && index < segments.length - 1) {
              const nextSegment = segments[index + 1];
              caches.open("CR_" + nextSegment).then((cache) => {
                cache.put(event.request, clonedResponse);
              });
            }
          } else if (requestString.indexOf('bookcontent') === -1) {
            console.log('Non book content request');
            caches.open('CRCache').then((cache) => {
              cache.put(event.request, clonedResponse);
            });
          }
        }
        return response;
      })
      .catch(function(error) {
        console.error('Failed to fetch file:', error);
      });
    })
  );
});