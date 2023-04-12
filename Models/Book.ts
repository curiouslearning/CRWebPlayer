// Page type that de

import { Page } from "./Page";

export enum BookType {
    CuriousReader = "CuriousReader",
    GDL = "GDL",
    Unknown = "Unknown",
}

export type Book = {
    pages: Page[];
    bookType: BookType;
}