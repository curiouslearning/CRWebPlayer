// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./Parser/ContentParser";
import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";
import { Workbox, WorkboxEventMap } from "workbox-window";
import { Book } from "./Models/Models";

let appVersion: string = "v0.2.7";

export class App {

    contentParser: ContentParser;
    playBackEngine: PlayBackEngine;

    contentFilePath: string;
    imagesPath: string;
    audioPath: string;
    bookName: string;

    broadcastChannel: BroadcastChannel;

    cachedLanguages: Map<string, string> | null = new Map<string, string>();
    lang: string = "english";
    isCached: string = "is_cached";

    constructor(bookName: string, contentFilePath: string, imagesPath: string, audioPath: string) {
        console.log("Curious Reader App " + appVersion + " initializing!");
        this.bookName = bookName;
        this.contentFilePath = contentFilePath;
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.contentParser = new ContentParser(contentFilePath);
        this.playBackEngine = new PlayBackEngine(imagesPath, audioPath);
        this.broadcastChannel = new BroadcastChannel("cr-message-channel");

        if (localStorage.getItem(this.isCached) == null) {
            // this.cachedLanguages = new Map();
        } else {
            let cachedLanguageString: string | null = localStorage.getItem(this.isCached)!;
            // this.cachedLanguages = new Map(JSON.parse(cachedLanguageString));
        }
    }

    initialize() {
        (async () => {
            let book: Book = await this.contentParser.parseBook();
            book.bookName = this.bookName;

            console.log("App initialized!");
            console.log(book);

            this.enforceLandscapeMode();
            
            console.log("Adding a load event listener!");
            
            window.addEventListener("load", () => {
                (async () => {
                    console.log("Load event fired!");
                    await this.registerServiceWorker(book);
                })();
            });

            this.playBackEngine.initializeBook(book);
        })();
    }

    async registerServiceWorker(book: Book): Promise<void> {
        console.log("Registering Service Worker!");
        
        if ("serviceWorker" in navigator) {
            
            let wb = new Workbox("/sw.js", {});
            wb.register()
                .then((r) => { this.handleServiceWorkerRegistration(r) })
                .catch((e) => { console.error(e) });
                
            await navigator.serviceWorker.ready;

            if (localStorage.getItem(book.bookName) == null) {
                this.broadcastChannel.postMessage({
                    command: "Cache",
                    data: {
                        lang: this.lang,
                        bookData: book,
                        contentFile: this.contentFilePath,
                    }
                });
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

            navigator.serviceWorker.addEventListener("message", this.handleServiceWorkerMessage);
        } else {
            console.warn("Service Worker not supported!");
        }
    }

    handleServiceWorkerRegistration(registration: ServiceWorkerRegistration | undefined): void {
        try {
            registration?.installing?.postMessage({
                type: "Registartion",
                value: this.lang
            });
        } catch (error) {
            console.error("CRapp: Service Worker Registration Failed!", error);
        }
    }

    handleServiceWorkerMessage(event: MessageEvent): void {
        if (event.data.msg == "Recache") {
            console.log("CRapp: Recache Message Received!");
            // handleVersionUpdate(event.data);
        }else if (event.data.msg == "Loading") {
            console.log("CRapp: Loading Message Received!");
            console.log(event.data);
            let cacheInfoDiv = document.getElementById("cache-load-value");
            let progressValue = parseInt(event.data.data.progress);
            if (progressValue < 100) {
                cacheInfoDiv!.innerHTML = "Loading: " + progressValue + "%";
            } else if (progressValue >= 100) {
                cacheInfoDiv!.innerHTML = "Book is cached!";
                this.readLanguageDataFromCacheAndNotifyAndroidApp(event.data.data.bookName);
                // add book with a name to local storage as cached
                localStorage.setItem(event.data.data.bookName, "true");
            }

            // handleLoadingMessage(event.data);
        }else if (event.data.msg == "UpdateFound") {
            console.log("CRapp: Update Found Message Received!");
            let text = "Update Found\nPress ok to update.";
            // if (confirm(text) == true) {
            //     window.location.reload();
            // } else {
            //     text = "You canceled!";
            // }
            window.location.reload();
        }
    }

    readLanguageDataFromCacheAndNotifyAndroidApp(bookName: string) {
        //@ts-ignore
        if (window.Android) {
            let isContentCached: boolean = localStorage.getItem(bookName) !== null;
            //@ts-ignore
            window.Android.cachedStatus(isContentCached);
        }
    }

    enforceLandscapeMode() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock("landscape").then(() => {
                    console.log("Screen orientation locked to landscape!");
                }).catch((error) => {
                    console.log("Screen orientation lock failed! Interface may not work as expected on mobile devices!");
                });
            }
        } catch (error) {
            console.warn("Screen orientation lock not supported! Interface may not work as expected on mobile devices!");
        }
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

 // Passing absolute path to the content file and resource directories
 // Curious Reader Book: Let's Fly Level 2
let app: App = new App(bookName, `/BookContent/${bookName}/content/content.json`,
    `/BookContent/${bookName}/content/images/`,
    `/BookContent/${bookName}/content/audios/`);

// let app: App = new App("TallAndShortUk", "/BookContent/tallAndShortUk/content/content.json",
//     "/BookContent/TallAndShortUk/content/images/",
//     "/BookContent/TallAndShortUk/content/audios/");

// GDL Book: Talking Bag English
// let app: App = new App("/BookContent/TalkingBagEn/content/content.json",
    // "/BookContent/TalkingBagEn/content/images/",
    // "/BookContent/TalkingBagEn/content/audio/");

// Initialize the app, beginning to read the content file, parsing  and displaying the book
app.initialize();