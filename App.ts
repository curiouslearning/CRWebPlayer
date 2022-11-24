// Main Entry for the Curious Reader Web Player App
import { ContentParser } from "./Parser/ContentParser";
import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";
import { Book } from "./Models/Models";

 export class App {

    contentParser: ContentParser;
    playBackEngine: PlayBackEngine;

    constructor(contentFilePath: string) {
        // this.contentParser = new ContentParser(contentFilePath);
        // let book: Book = this.contentParser.parseBook();
        // this.playBackEngine = new PlayBackEngine();
        console.log("App initialized!");
    }

 }

 let app: App = new App("content.json");