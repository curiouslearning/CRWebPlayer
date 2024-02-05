// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./Parser/ContentParser";
import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";
import { Workbox, WorkboxEventMap } from "workbox-window";
import { Book } from "./Models/Models";
import { FirebaseAnalyticsManager } from "./Analytics/Firebase/FirebaseManager";

let appVersion: string = "v0.3.0";

const channel = new BroadcastChannel("my-channel");

let loadingScreen = document.getElementById("loadingScreen");

export class App {

    public bookName: string;
    public contentParser: ContentParser;
    public playBackEngine: PlayBackEngine;
    public contentFilePath: string;
    public imagesPath: string;
    public audioPath: string;
    public broadcastChannel: BroadcastChannel;
    public lang: string;
    public firebaseAnalyticsManager: FirebaseAnalyticsManager;

    constructor(bookName: string, contentFilePath: string, imagesPath: string, audioPath: string) {
        console.log("Curious Reader App " + appVersion + " initializing!");
        this.bookName = bookName;
        this.contentFilePath = contentFilePath;
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.firebaseAnalyticsManager = FirebaseAnalyticsManager.getInstance();
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
        if (window.Android && typeof window.Android.setContainerAppOrientation === 'function') {
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
                        }
                    });
                } else {
                    loadingScreen!.style.display = "none";
                }

                this.broadcastChannel.onmessage = (event) => {
                    console.log("CRapp: Message Received!");
                    console.log(event.data.command);
                    if (event.data.command == "Activated") {
                        this.broadcastChannel.postMessage({
                            command: "Cache",
                            data: {
                                lang: this.lang,
                                bookData: book,
                                contentFile: this.contentFilePath,
                            }
                        });
                    }
                };
                navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
            } catch (error) {
                console.log("Error Registering Service Worker", error);
            }

        }
    }

}

channel.addEventListener("message", handleServiceWorkerMessage);

function handleServiceWorkerMessage(event): void {
    if (event.data.msg == "Loading") {
        let progressValue = parseInt(event.data.data.progress);
        handleLoadingMessage(event, progressValue);

    }
    if (event.data.msg == "UpdateFound") {
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>.,update Found");
        handleUpdateFoundMessage();
    }
}

function handleLoadingMessage(event, progressValue): void {
    let progressBar = document.getElementById("progressBar");
    if (progressValue < 100) {
        progressBar!.style.width = progressValue + "%";
    } else if (progressValue >= 100) {
        loadingScreen!.style.display = "none";
        readLanguageDataFromCacheAndNotifyAndroidApp(event.data.data.bookName);
        // add book with a name to local storage as cached
        localStorage.setItem(event.data.data.bookName, "true");
    }
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

let app: App = new App(bookName, `/BookContent/${bookName}/content/content.json`,
    `/BookContent/${bookName}/content/images/`,
    `/BookContent/${bookName}/content/audios/`);

app.initialize()