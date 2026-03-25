import { BookLoader } from "./BookLoader";
import { initializeGdlBook } from "./GdlBookRuntime";

/**
 * Loader implementation for GDL books.
 */
export class GdlBookLoader implements BookLoader {
  private bookName: string;

  constructor(bookName: string) {
    this.bookName = bookName;
  }

  async load(): Promise<void> {
    await initializeGdlBook(this.bookName);
  }
}


