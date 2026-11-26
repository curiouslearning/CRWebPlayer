// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./src/Parser/ContentParser";
import { PlayBackEngine } from "./src/PlayBackEngine/PlayBackEngine";
import { registerServiceWorkerUpdates } from "@curiouslearning/sw";
import { Book } from "./src/Models/Models";
import { FirebaseAnalyticsManager } from "./src/Analytics/Firebase/FirebaseManager";
import { appName, appVersion, campaignId, campaignSource, crUserId } from "./src/common";
import { BookLoader, CrBookLoader } from "./src/Books/BookLoader";
import { GdlBookLoader } from "./src/Books/GdlBookLoader";
import { handleLoadingMessage, resetDownloadSessionStart } from "./src/Caching/DownloadProgress";

// const channel = new BroadcastChannel("my-channel");

let loadingScreen = document.getElementById("loadingScreen");

let firebaseAnalyticsManager: FirebaseAnalyticsManager = FirebaseAnalyticsManager.getInstance();

export class App {
  public bookName: string;
  public contentParser: ContentParser;
  public playBackEngine: PlayBackEngine;
  public contentFilePath: string;
  public imagesPath: string;
  public audioPath: string;
  public broadcastChannel: BroadcastChannel;
  public lang: any;
  // public firebaseAnalyticsManager: FirebaseAnalyticsManager;

  constructor(bookName: string, contentFilePath: string, imagesPath: string, audioPath: string) {
    console.log("Curious Reader App " + appVersion + " initializing!");
    this.bookName = bookName;
    this.contentFilePath = contentFilePath;
    this.imagesPath = imagesPath;
    this.audioPath = audioPath;
    // Leaving this just in case we need to log session start
    firebaseAnalyticsManager.logSessionStartWithPayload({
      app: appName,
      version: appVersion,
      cr_user_id: crUserId,
      source: campaignSource,
      campaignId: campaignId,
      book_name: bookName
    });
    resetDownloadSessionStart();
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
        await registerServiceWorkerUpdates({
          swUrl: '/sw.js',
          mode: 'confirm',
        });
      } catch (error) {
        console.log("Error Registering Service Worker", error);
      }

      try {
        await navigator.serviceWorker.ready;
        if (localStorage.getItem(book.bookName) == null && navigator.onLine) {
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
          if (event.data.command == "CachingProgress") {
            // console.log("Caching Progress: ", event.data.data.progress);
            let progressValue = parseInt(event.data.data.progress);
            handleLoadingMessage(event, progressValue);
          }
        };
      } catch (error) {
        console.log("Error handling service worker", error);
        loadingScreen!.style.display = "none";
      }
    } else {
      loadingScreen!.style.display = "none";
    }
  }
}

export function handleUpdateFoundMessage(): void {
  console.log("handleUpdateFoundMessage called in cr webplayer");
  let text = "Update Found.\nPlease accept the update by pressing Ok.";
  if (confirm(text) == true) {
    window.location.reload();
  } else {
    text = "Update will happen on the next launch.";
  }
}
/**
 * Factory to choose the appropriate loader based on the book name.
 */
function createBookLoader(bookName: string): BookLoader {
  if (bookName.startsWith("gdl-")) {
    return new GdlBookLoader(bookName);
  }

  return new CrBookLoader(bookName);
}

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let bookName = urlParams.get("book");

const defaultBookName: string = "LetsFlyLevel2En";

if (bookName == null) {
  bookName = defaultBookName;
}

console.log("Book Name: " + bookName);

// Create and use the appropriate loader based on the book type
const loader: BookLoader = createBookLoader(bookName);
loader.load();
