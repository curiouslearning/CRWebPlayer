importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js"
);

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST, {});

self.addEventListener("install", async function (e) {
  self.addEventListener("message", async (event) => {
    if (event.data.type === "Registration") {
      if (!!!caches.keys().length) {
        // number = 0;
        let cacheName = await getCacheName(event.data.value);
      } // The value passed from the main JavaScript file
    }
  });
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service worker activated");
  event.waitUntil(self.clients.claim());
});

const channel = new BroadcastChannel("my-channel");

channel.addEventListener("message", async function (event) {
  if (event.data.command === "Cache") {
    // number = 0;
    await getCacheName(event.data.data);
  }
});

function getCacheName(language) {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
        self.clients.matchAll().then((clients) => {
            clients.forEach((client) =>
                client.postMessage({
                    msg: "Loading",
                    data: 100,
                })
            );
        });
    });
  });
}

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});