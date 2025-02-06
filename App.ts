// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./src/Parser/ContentParser";
import { PlayBackEngine } from "./src/PlayBackEngine/PlayBackEngine";
import { Workbox, WorkboxEventMap } from "workbox-window";
import { Book } from "./src/Models/Models";
import { FirebaseAnalyticsManager } from "./src/Analytics/Firebase/FirebaseManager";
import { campaignId, campaignSource, crUserId } from "./src/common";

let appVersion: string = "v0.3.7";
let appName: string = "CRWebPlayer";

// const channel = new BroadcastChannel("my-channel");

let loadingScreen = document.getElementById("loadingScreen");

let sessionStartTime: Date;
let logged25PercentDownload: boolean = false;
let logged50PercentDownload: boolean = false;
let logged75PercentDownload: boolean = false;
let logged100PercentDownload: boolean = false;

let firebaseAnalyticsManager: FirebaseAnalyticsManager = FirebaseAnalyticsManager.getInstance();

export class App {
  public bookName: string;
  public contentParser: ContentParser;
  public playBackEngine: PlayBackEngine;
  public contentFilePath: string;
  public imagesPath: string;
  public audioPath: string;
  public broadcastChannel: BroadcastChannel;
  public lang: string;
  // public firebaseAnalyticsManager: FirebaseAnalyticsManager;

  constructor(bookName: string, contentFilePath: string, imagesPath: string, audioPath: string) {
    console.log("Curious Reader App " + appVersion + " initializing!");
    this.bookName = bookName;
    this.contentFilePath = contentFilePath;
    this.imagesPath = imagesPath;
    this.audioPath = audioPath;
    // Leaving this just in case we need to log session start
    // firebaseAnalyticsManager.logSessionStartWithPayload({
    //     app: appName,
    //     version: appVersion,
    //     cr_user_id: crUserId,
    //     source: campaignSource,
    //     campaignId: campaignId,
    //     book_name: bookName
    // });
    sessionStartTime = new Date();
    this.contentParser = new ContentParser(contentFilePath);
    this.playBackEngine = new PlayBackEngine(imagesPath, audioPath);
    this.broadcastChannel = new BroadcastChannel("cr-message-channel");
  }

  async initialize() {
    try {
      // Load and parse the book data
      const book = await this.contentParser.parseBook();
      book.bookName = this.bookName;

      // Log book information for debugging
      console.log("App initialized with book:", book);

      // Enforce landscape mode (if supported)
      this.enforceLandscapeMode();

      // Register a service worker for caching

      await this.registerServiceWorker(book);

      // Initialize the playback engine with the parsed book data
      this.playBackEngine.initializeBook(book);

      console.log("Initialization completed successfully!");
    } catch (error) {
      // Handle any errors that may occur during initialization
      console.error("Initialization error:", error);
    }
  }

  enforceLandscapeMode() {
    // Attempt to enforce landscape mode through Android bridge call
    // @ts-ignore
    if (window.Android && typeof window.Android.setContainerAppOrientation === "function") {
      //@ts-ignore
      window.Android.setContainerAppOrientation("landscape");
    }
  }

  async registerServiceWorker(book: Book) {
    if ("serviceWorker" in navigator) {
      try {
        let wb = new Workbox("/sw.js", {});
        await wb.register();
        await navigator.serviceWorker.ready;
        if (localStorage.getItem(book.bookName) == null) {
          loadingScreen!.style.display = "flex";
          this.broadcastChannel.postMessage({
            command: "Cache",
            data: {
              lang: this.lang,
              bookData: book,
              contentFile: this.contentFilePath,
            },
          });
        } else {
          loadingScreen!.style.display = "none";
        }

        this.broadcastChannel.onmessage = (event) => {
          // console.log("CRapp: Message Received!");
          console.log(event.data.command);
          if (event.data.command == "Activated") {
            this.broadcastChannel.postMessage({
              command: "Cache",
              data: {
                lang: this.lang,
                bookData: book,
                contentFile: this.contentFilePath,
              },
            });
          }
          if (event.data.command == "CachingProgress") {
            // console.log("Caching Progress: ", event.data.data.progress);
            let progressValue = parseInt(event.data.data.progress);
            handleLoadingMessage(event, progressValue);
          } else if (event.data.command == "UpdateFound") {
            handleUpdateFoundMessage();
          }
        };
      } catch (error) {
        console.log("Error Registering Service Worker", error);
      }
    }
  }
}

// TODO: Added to backlog for cleanup, we ideally should move this to a separate file,
// all the caching logic should be in the service worker class
// there's no need to have these functions separately added in the App.ts anymore since we have added the service worker
// communication over the broadcast channel instead of the
// [serviceWorker.addEventListener("message", handleServiceWorkerMessage);]
function handleLoadingMessage(event, progressValue): void {
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
    loadingScreen!.style.display = "none";
    if (!logged100PercentDownload) {
      logged100PercentDownload = true;
      logDownloadProgressWithPayloadToFirebase("download_completed", event.data.data.bookName);
    }
    // add book with a name to local storage as cached
    localStorage.setItem(event.data.data.bookName, "true");
    readLanguageDataFromCacheAndNotifyAndroidApp(event.data.data.bookName);
  }
}

/**
 * Log download progress with payload
 * @param eventName Name of the event to log
 * @param bookName Name of the book being downloaded
 */
function logDownloadProgressWithPayloadToFirebase(eventName: string, bookName: string): void {
  let timeSpent = new Date().getTime() - sessionStartTime.getTime();
  firebaseAnalyticsManager.logDownloadProgressWithPayload(eventName, {
    app: appName,
    version: appVersion,
    book_name: bookName,
    cr_user_id: crUserId,
    ms_since_session_start: timeSpent,
  });
}

function readLanguageDataFromCacheAndNotifyAndroidApp(bookName: string) {
  //@ts-ignore
  if (window.Android) {
    let isContentCached: boolean = localStorage.getItem(bookName) !== null;
    //@ts-ignore
    window.Android.cachedStatus(isContentCached);
  }
}

function handleUpdateFoundMessage(): void {
  let text = "Update Found.\nPlease accept the update by pressing Ok.";
  if (confirm(text) == true) {
    window.location.reload();
  } else {
    text = "Update will happen on the next launch.";
  }
}

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let bookName = urlParams.get("book");

const defaultBookName: string = "LetsFlyLevel2En";

if (bookName == null) {
  bookName = defaultBookName;
}

console.log("Book Name: " + bookName);

let app: App = new App(
  bookName,
  `/BookContent/${bookName}/content/content.json`,
  `/BookContent/${bookName}/content/images/`,
  `/BookContent/${bookName}/content/audios/`
);

app.initialize();
