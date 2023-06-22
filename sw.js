importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

workbox.precaching.precacheAndRoute([{"revision":"3fc6d3056ea3eb50d41c0dcc8b97e4b5","url":"dist/app.js"},{"revision":"c3bf00e585782373e1b601c07b513d85","url":"dist/fonts/Quicksand_Bold.otf"},{"revision":"8546bc86df8d5c909a5d0ad5f5ae1291","url":"dist/images/cropped-bird_red-2-up.webp"},{"revision":"891d5740c1af1fad4da3afee1289c11c","url":"dist/images/cropped-bird_red-2.webp"},{"revision":"d6223ad2dfebbfe22e932087e0ec74f0","url":"dist/images/red_bird_256.webp"},{"revision":"6f4089ad2ea19d91fcb2ba6d2f174cc2","url":"dist/index.html"},{"revision":"edb54272a3cbc426804f016027a8703b","url":"dist/styles/app.css"},{"revision":"eccaa30f1115ed90515a3f3020fa48c3","url":"index.html"},{"revision":"91d600ca317cc9985a0fc479c783f8ad","url":"manifest.json"}], {});

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