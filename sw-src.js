importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST, {});

const channel = new BroadcastChannel("cr-message-channel");

let version = 0.9;
let cachingProgress = 0;

self.addEventListener("install", async function (e) {
  self.addEventListener("message", async (event) => {
    console.log("Registration message received in the service worker ");
    if (event.data.type === "Registration") {
      if (!!!caches.keys().length) {
        cachingProgress = 0;
        let cacheName = await getCacheName(event.data.value);
      }
    }
  });
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service worker activated");
  event.waitUntil(self.clients.claim());
});

channel.addEventListener("message", async function (event) {
  console.log("Caching request received in the service worker with data: ");
  console.log(event.data);
  if (event.data.command === "Cache") {
    cachingProgress = 0;
    await cacheTheBookJSONAndImages(event.data.data);
  }
});

function cacheTheBookJSONAndImages(data) {
  console.log("Caching the book JSON and images");
  let bookData = data["bookData"];
  let bookAudioAndImageFiles = [];
  
  for (let i = 0; i < bookData["pages"].length; i++) {
    let page = bookData["pages"][i];
    for (let j = 0; j < page["visualElements"].length; j++) {
      let visualElement = page["visualElements"][j];
      if (visualElement["type"] === "audio") {
        bookAudioAndImageFiles.push("/BookContent/LetsFlyLevel2En/content/" + visualElement["audioSrc"]);
        for (let k = 0; k < visualElement["audioTimestamps"]["timestamps"].length; k++) {
          bookAudioAndImageFiles.push("/BookContent/LetsFlyLevel2En/content/" + visualElement["audioTimestamps"]["timestamps"][k]["audioSrc"]);
        }
      } else if (visualElement["type"] === "image" && visualElement["imageSource"] !== "empty_glow_image") {
        bookAudioAndImageFiles.push("/BookContent/LetsFlyLevel2En/content/" + visualElement["imageSource"]);
      }
    }
  }

  bookAudioAndImageFiles.push(data["contentFile"]);

  console.log("Book audio files: ", bookAudioAndImageFiles);

  caches.open(bookData["bookName"]).then((cache) => {
    cache.addAll(bookAudioAndImageFiles).catch((error) => {
      console.log("Error while caching the book JSON", error);
    });
  });
  // self.clients.matchAll().then((clients) => {
  //     clients.forEach((client) =>
  //         client.postMessage({
  //             msg: "Loading",
  //             data: 100,
  //         })
  //     );
  // });
}

self.addEventListener("fetch", function (event) {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol === 'chrome-extension:') {
    return;
  }
  event.respondWith(
      caches.match(event.request).then(function (response) {
          if (response) {
            return response;
          }
          return fetch(event.request);
      })
  );
});