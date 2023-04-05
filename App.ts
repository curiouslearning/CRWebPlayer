// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./Parser/ContentParser";
import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";
import { CRServiceWorker } from "./Helpers/ServiceWorker/ServiceWorker";
import { Book } from "./Models/Models";
import { Splide } from "@splidejs/splide";

 export class App {

    contentParser: ContentParser;
    playBackEngine: PlayBackEngine;
    serviceWorker: CRServiceWorker;
    
    contentFilePath: string;
    imagesPath: string;
    audioPath: string;

    cachedLanguages: Map<string, string> | null = new Map<string, string>();
    cachedLanguagesTag: string = "cached_languages";
    lang: string = "english";

    constructor(contentFilePath: string, imagesPath: string, audioPath: string) {
        this.contentFilePath = contentFilePath;
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.contentParser = new ContentParser(contentFilePath);
        this.playBackEngine = new PlayBackEngine(imagesPath, audioPath);
        this.serviceWorker = new CRServiceWorker();
        this.serviceWorker.InitializeAndRegister();
    }

    async initialize() {
        let book: Book = await this.contentParser.parseBook();

        console.log("Dev App initialized!");
        console.log(book);

        this.enforceLandscapeMode();
        
        window.addEventListener("load", async () => {
            this.readLanguageDataFromCacheAndNotifyAndroidApp();
        });

        this.playBackEngine.initializeBook(book);
    }

    readLanguageDataFromCacheAndNotifyAndroidApp() {
        if (localStorage.getItem(this.cachedLanguagesTag) == null) {
            this.cachedLanguages == new Map();
        } else {
            let cachedLanguageString: string | null = localStorage.getItem(this.cachedLanguagesTag)!;
            this.cachedLanguages = new Map(JSON.parse(cachedLanguageString));
        }
        //@ts-ignore
        if (window.Android) {
            //@ts-ignore
            window.Android.receiveData(cachedLanguages.has(lang) ? cachedLanguages.get(lang) : null);
        }
    }

    enforceLandscapeMode() {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("landscape")
            .then(() => {
                console.log("Screen orientation locked to landscape!");
            })
            .catch((error) => {
                console.error("Failed to lock screen orientation: ", error);
            });
        } else {
            console.warn("Screen orientation lock not supported! Interface may not work as expected on mobile devices!");
        }
    }

 }

 // Passing absolute path to the content file and resource directories
let app: App = new App("/BookContent/LetsFlyLevel2En/content/content.json",
    "/BookContent/LetsFlyLevel2En/content/images/",
    "/BookContent/LetsFlyLevel2En/content/audio/");

// Initialize the app, beginning to read the content file, parsing  and displaying the book
app.initialize();