// Class that handles the playback of the whole book
import { Book, Page, TextElement, ImageElement, AudioElement  } from "../Models/Models";
import { Splide } from "@splidejs/splide";

export class PlayBackEngine {

    currentPage: number;
    numberOfPages: number;
    transitioningToPage: boolean;

    constructor() {
        this.currentPage = 0;
    }

    initializeBook(book: Book) {
        this.numberOfPages = book.pages.length;
    }

    goToNextPage() {
        if (this.transitioningToPage) return;
        if (this.currentPage < this.numberOfPages) {
            this.currentPage++;
        }
        this.transitionToPage(this.currentPage);
    }

    goToPreviousPage() {
        if (this.transitioningToPage) return;
        if (this.currentPage > 0) {
            this.currentPage--;
        }
        this.transitionToPage(this.currentPage);
    }

    transitionToPage(pageNumber: number) {
        this.transitioningToPage = true;
    }
}