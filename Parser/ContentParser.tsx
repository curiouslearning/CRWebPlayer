import { Book } from "../Models/Book";
import { Page } from "../Models/Page";
import { TextElement } from "../Models/TextElement";
import { ImageElement } from "../Models/ImageElement";
import { AudioElement } from "../Models/AudioElement";

export class ContentParser {

    imagesPath: string;
    audioPath: string;
    contentFilePath: string;

    constructor(contentFilePath: string) {
        this.contentFilePath = contentFilePath;
    }

    parseBook(): Book {
        let book: Book = {
            pages: [],
        };
        book.pages = this.parsePages();
        return book;
    }

    parsePages(): Page[] {
        let pages: Page[] = [];
        pages.push(this.parsePage());
        return pages;
    }

    

    parseContentJSONFile(): any {
        let contentJSON = 
    }



}
