// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./Parser/ContentParser";
import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";
import { Book } from "./Models/Models";
import { Splide } from "@splidejs/splide";

 export class App {

    contentParser: ContentParser;
    playBackEngine: PlayBackEngine;
    
    contentFilePath: string;
    imagesPath: string;
    audioPath: string;

    constructor(contentFilePath: string, imagesPath: string, audioPath: string) {
        this.contentFilePath = contentFilePath;
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.contentParser = new ContentParser(contentFilePath);
        this.playBackEngine = new PlayBackEngine(imagesPath, audioPath);
    }

    async initialize() {
        let book: Book = await this.contentParser.parseBook();

        console.log("App initialized!");
        console.log(book);

        this.playBackEngine.initializeBook(book);
    }

 }

 // Passing absolute path to the content file and resource directories
let app: App = new App("/BookContent/LetsFlyLevel2En/content/content.json",
    "/BookContent/LetsFlyLevel2En/content/images/",
    "/BookContent/LetsFlyLevel2En/content/audio/");

// Initialize the app, beginning to read the content file, parsing  and displaying the book
app.initialize();