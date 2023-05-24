
// Class that handles the playback of the whole book
import { Book, BookType, Page, TextElement, ImageElement, AudioElement, AudioTimestamps, WordTimestampElement  } from "../Models/Models";
import { Splide } from "@splidejs/splide";

export class PlayBackEngine {

    currentPage: number;
    numberOfPages: number;
    transitioningToPage: boolean;

    imagesPath: string;
    audioPath: string;

    emptyGlowImageTag: string = "empty_glow_image";

    splideHandle: Splide;

    currentBookType: BookType;

    book: Book;

    constructor(imagesPath: string, audioPath: string) {
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.currentPage = 0;
        this.splideHandle = new Splide('.splide', {
            fixedHeight: window.innerHeight - 20,
        }).mount();

        this.splideHandle.on('move', (newIndex, oldIndex, destIndex) => {
            console.log("move");
            this.transitioningToPage = true;
        });

        this.splideHandle.on('moved', (currentIndex, prevIndex, destIndex) => {
            console.log("moved");
            this.currentPage = currentIndex;
            this.transitioningToPage = false;
        });

        this.addPageResizeListener();
    }

    addPageResizeListener() {
        window.addEventListener('resize', () => {
            this.splideHandle.options.fixedHeight = window.innerHeight - 20;
            this.splideHandle.refresh();
        });
    }

    initializeBook(book: Book) {
        this.book = book;
        this.currentBookType = book.bookType;
        this.numberOfPages = book.pages.length;

        if (this.currentBookType === BookType.CuriousReader) {
            this.initializeCuriousReaderBook(book);
        } else if (this.currentBookType === BookType.GDL) {
            this.initializeGDLBook(book);
        }
    }

    initializeCuriousReaderBook(book: Book) {
        this.numberOfPages = book.pages.length;

        for (let i = 0; i < book.pages.length; i++) {
            const slide = document.createElement('li');
            slide.classList.add('splide__slide');

            // foreach visualelement in page add to slide
            for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                let visualElement = book.pages[i].visualElements[j];
                if (visualElement.type == "text") {
                    let textElement: TextElement = visualElement;
                    
                    slide.appendChild(this.createTextContainer(textElement));
                } else if (visualElement.type == "image") {
                    let imageElement: ImageElement = visualElement;

                    if (imageElement.imageSource === this.emptyGlowImageTag) {
                        continue;
                    }

                    slide.appendChild(this.createImageContainer(imageElement));
                } else if (visualElement.type == "audio") {
                    let audioElement: AudioElement = visualElement;

                    slide.appendChild(this.createAudioContainer(audioElement));
                }

                this.splideHandle.add(slide);
            }
        }
    }

    createTextContainer(textElement: TextElement): HTMLDivElement {
        let textElementDiv = document.createElement('div');
        
        textElementDiv.classList.add('cr-text');
        textElementDiv.style.position = "absolute";
        textElementDiv.style.webkitTextStroke = "1px #303030";
        textElementDiv.style.color = "#FFFFFF";
        textElementDiv.style.textShadow = "0.1rem 0.15rem 0.1rem #303030";
        textElementDiv.style.fontFamily = "Quicksand";
        textElementDiv.style.fontWeight = "800";
        textElementDiv.style.fontSize = "1.7em";
        textElementDiv.style.top = textElement.positionY + "%";
        textElementDiv.style.left = textElement.positionX + "%";
        textElementDiv.style.width = textElement.width + "%";
        textElementDiv.style.height = textElement.height + "%";
        textElementDiv.innerHTML = textElement.textContentAsHTML;

        return textElementDiv;
    }

    createImageContainer(imageElement: ImageElement): HTMLDivElement {
        let imageElementDiv = document.createElement('div');

        imageElementDiv.classList.add('cr-image');
        imageElementDiv.style.position = "absolute";
        imageElementDiv.style.top = imageElement.positionY + "%";
        imageElementDiv.style.left = imageElement.positionX + "%";
        imageElementDiv.style.width = imageElement.width + "%";
        imageElementDiv.style.height = imageElement.height + "%";

        let imageElementImg = document.createElement('img');
        imageElementImg.src = this.imagesPath + imageElement.imageSource.replace("images/", "");
        imageElementImg.style.width = "100%";
        imageElementImg.style.height = "100%";
        imageElementDiv.appendChild(imageElementImg);

        return imageElementDiv;
    }

    createAudioContainer(audioElement: AudioElement): HTMLDivElement {
        let audioElementDiv = document.createElement('div');

        audioElementDiv.classList.add('cr-audio');
        audioElementDiv.style.position = "absolute";
        // audioElementDiv.style.top = audioElement.positionY + "%";
        // audioElementDiv.style.left = audioElement.positionX + "%";
        // audioElementDiv.style.width = audioElement.width + "%";
        // audioElementDiv.style.height = audioElement.height + "%";

        let audioEement = document.createElement('audio');
        audioEement.src = this.audioPath + audioElement.audioSrc.replace("audios/", "");
        audioEement.controls = false;
        // audioEement.style.width = "100%";
        // audioEement.style.height = "100%";
        audioElementDiv.appendChild(audioEement);

        return audioElementDiv;
    }

    initializeGDLBook(book: Book) {
        for (let i = 0; i < book.pages.length; i++) {
            const slide = document.createElement('li');
            slide.classList.add('splide__slide');

            // Add a flexbox container to the slide with a column layout
            let flexContainer = document.createElement('div');
            flexContainer.classList.add('gdl-flex-container');
            flexContainer.style.display = "flex";
            flexContainer.style.flexDirection = "column";
            flexContainer.style.justifyContent = "center";
            flexContainer.style.alignItems = "center";
            flexContainer.style.height = "100%";
            flexContainer.style.width = "100%";
            slide.appendChild(flexContainer);

            // foreach visualelement in page add to slide
            for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                let visualElement = book.pages[i].visualElements[j];
                if (visualElement.type == "text") {
                    let textElement: TextElement = visualElement;
                    let textElementDiv = document.createElement('div');
                    textElementDiv.style.width = "60%";

                    textElementDiv.classList.add('gdl-text');
                    textElementDiv.style.webkitTextStroke = "1px #303030";
                    textElementDiv.style.color = "#FFFFFF";
                    textElementDiv.style.textShadow = "0.1rem 0.15rem 0.1rem #303030";
                    textElementDiv.style.fontFamily = "Quicksand";
                    textElementDiv.style.fontWeight = "800";
                    textElementDiv.style.fontSize = "1.7em";
                    textElementDiv.innerHTML = textElement.textContentAsHTML;
                    flexContainer.appendChild(textElementDiv);
                } else if (visualElement.type == "image") {
                    let imageElement: ImageElement = visualElement;

                    let imageElementDiv = document.createElement('div');
                    imageElementDiv.classList.add('gdl-image');

                    let imageElementImg = document.createElement('img');
                    imageElementImg.src = this.imagesPath + imageElement.imageSource.replace("images/", "");
                    imageElementImg.style.width = "100%";
                    imageElementImg.style.height = "100%";
                    imageElementDiv.appendChild(imageElementImg);
                    flexContainer.appendChild(imageElementDiv);
                }
            }

            this.splideHandle.add(slide);
        }
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