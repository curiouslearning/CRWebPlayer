import { Book, Page, TextElement, ImageElement, AudioElement } from "../Models/Models";

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
