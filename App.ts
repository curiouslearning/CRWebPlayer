 // Main Entry for the Curious Reader Web Player App
 import { ContentParser } from "./Parser/ContentParser";
 import { PlayBackEngine } from "./PlayBackEngine/PlayBackEngine";

 export class App {

    contentParser: ContentParser;
    playBackEngine: PlayBackEngine;

    constructor(contentFilePath: string) {
        this.contentParser = new ContentParser(contentFilePath);
        let book: Book = this.contentParser.parseBook();
        this.playBackEngine = new PlayBackEngine();
    }

 }