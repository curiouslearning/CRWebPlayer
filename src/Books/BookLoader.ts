import { App } from "../../App";
/**
 * Abstraction for loading and displaying a book.
 * Different implementations can handle different book types (CR, GDL, etc.)
 */
export interface BookLoader {
  load(): Promise<void>;
}

/**
 * Loader implementation for standard CR books using the existing App flow.
 */
export class CrBookLoader implements BookLoader {
  private bookName: string;

  constructor(bookName: string) {
    this.bookName = bookName;
  }

  async load(): Promise<void> {
    const app: App = new App(
      this.bookName,
      `/BookContent/${this.bookName}/content/content.json`,
      `/BookContent/${this.bookName}/content/images/`,
      `/BookContent/${this.bookName}/content/audios/`
    );

    await app.initialize();
  }
}


