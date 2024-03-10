// Class that handles the playback of the whole book
import {
    Book,
    BookType,
    Page,
    TextElement,
    ImageElement,
    AudioElement,
    AudioTimestamps,
    WordTimestampElement,
} from "../Models/Models";
import { EVENT_ACTIVE, Splide } from "@splidejs/splide";

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

    currentPageAutoPlayerInterval: any;

    currentlyPlayingAudioElement: HTMLAudioElement | null = null;

    currentWordPlayingTimeout: NodeJS.Timeout;

    currentGlowImageTimeout: NodeJS.Timeout;

    currentlyActiveGlowImages: HTMLDivElement[] = [];

    currentlyActiveWord: HTMLDivElement | null = null;

    constructor(imagesPath: string, audioPath: string) {
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.currentPage = 0;
        this.splideHandle = new Splide(".splide", {
            fixedHeight: window.innerHeight - 20,
        }).mount();

        this.splideHandle.on("move", (newIndex, oldIndex, destIndex) => {
            if (this.currentPage !== newIndex) {
                this.transitioningToPage = true;
                this.stopPageAudio(this.book.pages[oldIndex]);
            }
        });

        this.splideHandle.on("moved", (currentIndex, prevIndex, destIndex) => {
            if (this.currentPage !== currentIndex) {
                this.currentPage = currentIndex;
                this.transitioningToPage = false;
                this.playPageAudio(this.book.pages[currentIndex], currentIndex);
            }
        });

        this.splideHandle.on("drag", (newIndex, oldIndex, destIndex) => {
            if (this.currentPage !== newIndex) {
                this.transitioningToPage = true;
                this.stopPageAudio(this.book.pages[oldIndex]);
            }
        });

        this.splideHandle.on("dragged", (currentIndex, prevIndex, destIndex) => {
            if (this.currentPage !== currentIndex) {
                this.currentPage = currentIndex;
                this.transitioningToPage = false;
                this.playPageAudio(this.book.pages[currentIndex], currentIndex);
            }
        });

        this.addPageResizeListener();
    }

    stopPageAudio(page: Page) {
        // loop through page's visual elements, if we find an audio object get it by id and stop it
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement: AudioElement = visualElement;
                let audioElementDom = document.getElementById(audioElement.domID) as HTMLAudioElement;
                audioElementDom.pause();
                audioElementDom.currentTime = 0;
                clearInterval(this.currentPageAutoPlayerInterval);
                for (let j = 0; j < audioElement.audioTimestamps.timestamps.length; j++) {
                    let wordElement = document.getElementById(audioElement.domID + "_word_" + j) as HTMLDivElement;
                    wordElement.classList.remove("cr-clickable-word-active");
                    wordElement.style.color = "white";
                }
            }
        }
    }

    playPageAudio(page: Page, pageIndex: number) {
        // loop through page's visual elements, if we find an audio object get it by id and play it
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement: AudioElement = visualElement;
                let audioElementDom = document.getElementById(audioElement.domID) as HTMLAudioElement;
                audioElementDom.play();
                this.currentlyPlayingAudioElement = audioElementDom;

                let lastWordIndex = 0;
                let currentIndex = 0;

                this.currentPageAutoPlayerInterval = setInterval(() => {
                    if (audioElement.audioTimestamps !== undefined) {
                        let currentTime = audioElementDom.currentTime;
                        for (let j = 0; j < audioElement.audioTimestamps.timestamps.length; j++) {
                            if (currentTime >= audioElement.audioTimestamps.timestamps[j].startTimestamp && currentTime <= audioElement.audioTimestamps.timestamps[j].endTimestamp) {
                                currentIndex = j;
                                let wordElement = document.getElementById(audioElement.domID + "_word_" + currentIndex) as HTMLDivElement;
                                this.currentlyActiveWord = wordElement;
                                wordElement.classList.add("cr-clickable-word-active");
                                wordElement.style.color = audioElement.glowColor;
                                this.enableConnectedGraphicHighlighting(pageIndex, currentIndex);
                            }

                            if (lastWordIndex < currentIndex) {
                                // console.log("Current index: " + currentIndex + " last index: " + lastWordIndex);
                                let wordElement = document.getElementById(audioElement.domID + "_word_" + lastWordIndex) as HTMLDivElement;
                                wordElement.classList.remove("cr-clickable-word-active");
                                wordElement.style.color = "white";
                                lastWordIndex = currentIndex;
                            }
                        }
                        if (currentTime >= audioElement.audioTimestamps.timestamps[audioElement.audioTimestamps.timestamps.length - 1].endTimestamp - 0.1) {
                            // console.log("Finished Highlighting! Current index: " + currentIndex + " last index: " + lastWordIndex);
                            let wordElement = document.getElementById(audioElement.domID + "_word_" + currentIndex) as HTMLDivElement;
                            wordElement.classList.remove("cr-clickable-word-active");
                            wordElement.style.color = "white";
                            this.currentlyPlayingAudioElement = null;
                            clearInterval(this.currentPageAutoPlayerInterval);
                        }
                    }
                }, 60);
            }
        }
    }

    addPageResizeListener() {
        window.addEventListener("resize", () => {
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
            const slideLi = document.createElement("li");
            const slide = document.createElement("div");

            slideLi.style.display = "flex";
            slideLi.style.justifyContent = "center";
            slideLi.style.alignItems = "center";
            
            slide.style.position = "relative";
            slide.style.width = "80%";
            slide.style.height = "80%";

            slideLi.appendChild(slide);

            slideLi.classList.add("splide__slide");

            let sentenceInitializedByAudio = false;

            // First we are adding the image and audio elements and the text after
            // the reasoning behind this is that if the page contains an audio
            // element in that case we should initialize text from the audio
            // timestamps that we get from the content file
            for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                let visualElement = book.pages[i].visualElements[j];
                if (visualElement.type == "image") {
                    let imageElement: ImageElement = visualElement;
                    let pageIndex = i;
                    slide.appendChild(this.createImageContainer(pageIndex, imageElement, j));
                } else if (visualElement.type == "audio") {
                    sentenceInitializedByAudio = true;
                    let audioElement: AudioElement = visualElement;

                    let textElement: TextElement = null;

                    for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                        let visualElement = book.pages[i].visualElements[j];
                        if (visualElement.type == "text") {
                            textElement = visualElement;
                            break;
                        }
                    }

                    if (textElement) {
                        let audioAndTextDivs = this.createAudioAndTextContainers(i, audioElement, textElement);
                        slide.appendChild(audioAndTextDivs[0]);
                        slide.appendChild(audioAndTextDivs[1]);
                    } else {
                        slide.appendChild(this.createAudioContainer(audioElement));
                    }
                }

                this.splideHandle.add(slideLi);
            }

            // If the sentence wasn't not initialized by the audio object
            // then we add it here
            if (!sentenceInitializedByAudio) {
                for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                    let visualElement = book.pages[i].visualElements[j];
                    if (visualElement.type == "text") {
                        let textElement: TextElement = visualElement;

                        slide.appendChild(this.createTextContainer(textElement));
                    }
                }
            }
        }
    }

    createTextContainer(textElement: TextElement): HTMLDivElement {
        let textElementDiv = document.createElement("div");

        textElementDiv.id = "cr-text";
        textElementDiv.classList.add("cr-text");
        textElementDiv.style.position = "absolute";
        textElementDiv.style.webkitTextStroke = "1px #303030";
        textElementDiv.style.color = "#FFFFFF";
        textElementDiv.style.textShadow = "0.1rem 0.15rem 0.1rem #303030";
        textElementDiv.style.fontFamily = "Quicksand";
        textElementDiv.style.fontWeight = "800";
        textElementDiv.style.fontSize = "inherit";
        textElementDiv.style.top = textElement.positionY + "%";
        textElementDiv.style.left = textElement.positionX + "%";
        textElementDiv.style.width = textElement.width + "%";
        textElementDiv.style.height = textElement.height + "%";
        // textElementDiv.innerHTML = textElement.textContentAsHTML.replace("2.25em", "");
        textElementDiv.innerHTML = textElement.textContentAsHTML.replace(/font-size:[^;]+;/g, "");

        return textElementDiv;
    }

    createImageContainer(pageIndex: number, imageElement: ImageElement, elementIndex: number): HTMLDivElement {
        let imageElementDiv = document.createElement("div");

        imageElementDiv.style.position = "absolute";
        imageElementDiv.style.top = imageElement.positionY + "%";
        imageElementDiv.style.left = imageElement.positionX + "%";
        imageElementDiv.style.width = imageElement.width + "%";
        imageElementDiv.style.height = imageElement.height + "%";

        if (imageElement.imageSource === this.emptyGlowImageTag) {
            imageElementDiv.classList.add("cr-image-empty-glow");
            // Using classes here instead of id assignment, because we could have multiple glowing divs
            // attached to one word in the sentence and having multiple elements with the same id is not
            // allowed in HTML
            if (imageElement.domID === undefined || imageElement.domID === null || imageElement.domID === "") {
                const id = "img" + pageIndex + "_" + elementIndex;
                imageElementDiv.id = id;
                imageElementDiv.addEventListener("click", () => {
                    // This means that the glowing object isn't connected to any word in the sentence, it should still have
                    // a glow effect though
                    this.handleStandaloneGlowImageClick(pageIndex, id);
                });
            } else {
                imageElementDiv.classList.add(imageElement.domID);
                imageElementDiv.addEventListener("click", () => {
                    this.handleGlowImageClick(pageIndex, imageElement.domID.split("_")[1]);
                });
            }
        } else {
            imageElementDiv.id = imageElement.domID;
            imageElementDiv.classList.add("cr-image");

            let imageElementImg = document.createElement("img");
            imageElementImg.src =
                this.imagesPath + imageElement.imageSource.replace("images/", "");
            imageElementImg.style.width = "100%";
            imageElementImg.style.height = "100%";
            imageElementDiv.appendChild(imageElementImg);
        }

        return imageElementDiv;
    }

    createAudioContainer(audioElement: AudioElement): HTMLDivElement {
        let audioElementDiv = document.createElement("div");

        audioElementDiv.classList.add("cr-audio");
        audioElementDiv.style.position = "absolute";

        let pageAudio = document.createElement("audio");
        pageAudio.id = audioElement.domID;
        pageAudio.src = this.audioPath + audioElement.audioSrc.replace("audios/", "");
        pageAudio.controls = false;
        audioElementDiv.appendChild(pageAudio);

        if (audioElement.audioTimestamps !== undefined) {
            for (let i = 0; i < audioElement.audioTimestamps.timestamps.length; i++) {
                let wordTimestampElement: WordTimestampElement = audioElement.audioTimestamps.timestamps[i];
                let wordAudioElement = document.createElement("audio");
                wordAudioElement.id = wordTimestampElement.domID;
                wordAudioElement.src = this.audioPath + wordTimestampElement.audioSrc.replace("audios/", "");
                wordAudioElement.controls = false;
                audioElementDiv.appendChild(wordAudioElement);
            }
        }

        return audioElementDiv;
    }

    createAudioAndTextContainers(pageIndex: number, audioElement: AudioElement, textElement: TextElement): HTMLDivElement[] {
        let audioAndTextArray: HTMLDivElement[] = Array();

        let audioElementDiv = document.createElement("div");

        audioElementDiv.classList.add("cr-audio");
        audioElementDiv.style.position = "absolute";

        let pageAudio = document.createElement("audio");
        pageAudio.id = audioElement.domID;
        pageAudio.src = this.audioPath + audioElement.audioSrc.replace("audios/", "");
        pageAudio.controls = false;
        audioElementDiv.appendChild(pageAudio);

        let sentenceArrayTrimmed: string[] = Array();

        if (audioElement.audioTimestamps !== undefined) {
            for (let i = 0; i < audioElement.audioTimestamps.timestamps.length; i++) {
                let wordTimestampElement: WordTimestampElement = audioElement.audioTimestamps.timestamps[i];
                let wordAudioElement = document.createElement("audio");
                wordAudioElement.id = wordTimestampElement.domID;
                wordAudioElement.src = this.audioPath + wordTimestampElement.audioSrc.replace("audios/", "");
                wordAudioElement.controls = false;
                sentenceArrayTrimmed.push(wordTimestampElement.word.trim());
                audioElementDiv.appendChild(wordAudioElement);
            }
        }

        audioAndTextArray.push(audioElementDiv);

        let audioContentDOMId = audioElement.domID;

        let textElementDiv = document.createElement("div");

        textElementDiv.id = "cr-text";
        textElementDiv.classList.add("cr-text");
        textElementDiv.style.position = "absolute";
        textElementDiv.style.display = "flex";
        textElementDiv.style.justifyContent = "center";
        textElementDiv.style.alignItems = "center";
        textElementDiv.style.webkitTextStroke = "1px #303030";
        textElementDiv.style.color = "#FFFFFF";
        textElementDiv.style.textShadow = "0.1rem 0.15rem 0.1rem #303030";
        textElementDiv.style.fontFamily = "Quicksand";
        textElementDiv.style.fontWeight = "800";
        // textElementDiv.style.fontSize = "2rem";
        textElementDiv.style.top = textElement.positionY + "%";
        
        textElementDiv.style.height = textElement.height + "%";
        
        if (textElement.positionX > 50.5) {
            textElementDiv.style.left = textElement.positionX + "%";
        } else if (textElement.positionX < 15 && textElement.width < 90) {
            textElementDiv.style.left = textElement.positionX + "%";
            textElementDiv.style.width = textElement.width + "%";
        } else {
            textElementDiv.style.width = "100%";
        }

        let sentenceParagraph: HTMLParagraphElement = document.createElement("p");
        sentenceParagraph.style.textAlign = "center";
        // sentenceParagraph.style.fontSize = "2rem";
        sentenceParagraph.style.margin = "0px";

        for (let i = 0; i < sentenceArrayTrimmed.length; i++) {
            let clickableWordElement: HTMLSpanElement = document.createElement("div");
            clickableWordElement.id = audioContentDOMId + "_word_" + i;
            clickableWordElement.classList.add("cr-clickable-word");
            clickableWordElement.style.marginLeft = "10px";
            clickableWordElement.style.marginRight = "10px";
            clickableWordElement.innerText = sentenceArrayTrimmed[i];
            clickableWordElement.addEventListener("click", (ev) => {
                this.handleInteractiveWordClick(pageIndex, i);
            });
            sentenceParagraph.appendChild(clickableWordElement);
        }

        textElementDiv.appendChild(sentenceParagraph);

        audioAndTextArray.push(textElementDiv);

        return audioAndTextArray;
    }

    handleStandaloneGlowImageClick(pageIndex: number, id: string) {
        if (this.currentlyPlayingAudioElement !== null) {
            this.currentlyPlayingAudioElement.pause();
            this.currentlyPlayingAudioElement.currentTime = 0;
            clearInterval(this.currentPageAutoPlayerInterval);
            clearTimeout(this.currentWordPlayingTimeout);
            clearTimeout(this.currentGlowImageTimeout);

            if (this.currentlyActiveGlowImages.length > 0) {
                for (let i = 0; i < this.currentlyActiveGlowImages.length; i++) {
                    this.currentlyActiveGlowImages[i].style.boxShadow = "transparent 0px 0px 20px 20px";
                }
            }
        }

        this.currentlyActiveGlowImages = Array();

        let glowDiv = document.getElementById(id) as HTMLDivElement;

        this.currentlyActiveGlowImages.push(glowDiv);
        glowDiv.style.boxShadow = "orange 0px 0px 20px 20px";

        this.currentGlowImageTimeout = setTimeout(() => {
            let glowDiv = document.getElementById(id) as HTMLDivElement;
            glowDiv.style.boxShadow = "transparent 0px 0px 20px 20px";
        }, 600);
    }

    handleGlowImageClick(pageIndex: number, wordIndex: string) {
        // Parse the number from the wordIndex
        let wordIndexNumber = parseInt(wordIndex);
        this.handleInteractiveWordClick(pageIndex, wordIndexNumber);
    }

    enableConnectedGraphicHighlighting(pageIndex: number, wordIndex: number) {
        this.handleInteractiveWordClick(pageIndex, wordIndex, true);
    }

    handleInteractiveWordClick(pageIndex: number, wordIndex: number, glowImageOnly: boolean = false) {
        if (this.currentlyPlayingAudioElement !== null && !glowImageOnly) {
            this.currentlyPlayingAudioElement.pause();
            this.currentlyPlayingAudioElement.currentTime = 0;
            clearInterval(this.currentPageAutoPlayerInterval);
            clearTimeout(this.currentWordPlayingTimeout);
            clearTimeout(this.currentGlowImageTimeout);
            if (this.currentlyActiveWord !== null) {
                this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
                this.currentlyActiveWord.style.color = "white";
            }
            if (this.currentlyActiveGlowImages.length > 0) {
                for (let i = 0; i < this.currentlyActiveGlowImages.length; i++) {
                    this.currentlyActiveGlowImages[i].style.boxShadow = "transparent 0px 0px 20px 20px";
                }
            }
        }
        this.currentlyActiveGlowImages = Array();
        let page = this.book.pages[pageIndex];
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement: AudioElement = visualElement;

                let wordAudioElement = document.getElementById(audioElement.audioTimestamps.timestamps[wordIndex].domID) as HTMLAudioElement;

                if (!glowImageOnly) {
                    // Highlight the word
                    let wordElement = document.getElementById(audioElement.domID + "_word_" + wordIndex) as HTMLDivElement;
                    this.currentlyActiveWord = wordElement;
                    wordElement.classList.add("cr-clickable-word-active");
                    wordElement.style.color = audioElement.glowColor;
    
                    this.currentWordPlayingTimeout = setTimeout(() => {
                        wordElement.classList.remove("cr-clickable-word-active");
                        wordElement.style.color = "white";
                    }, 600);
                }

                // Highlight the connected glow images
                let connectedGlowImageClass = "img" + audioElement.domID + "_" + wordIndex;
                let connectedGlowImages = document.getElementsByClassName(connectedGlowImageClass);
                for (let i = 0; i < connectedGlowImages.length; i++) {
                    let glowDiv = connectedGlowImages[i] as HTMLDivElement;
                    this.currentlyActiveGlowImages.push(glowDiv);
                    glowDiv.style.boxShadow = audioElement.glowColor + " 0px 0px 20px 20px";
                }

                this.currentGlowImageTimeout = setTimeout(() => {
                    for (let i = 0; i < connectedGlowImages.length; i++) {
                        let glowDiv = connectedGlowImages[i] as HTMLDivElement;
                        glowDiv.style.boxShadow = "transparent 0px 0px 20px 20px";
                    }
                }, 600);

                if (!glowImageOnly) {
                    this.currentlyPlayingAudioElement = wordAudioElement;
                    wordAudioElement.play();
                }
            }
        }
    }

    initializeGDLBook(book: Book) {
        for (let i = 0; i < book.pages.length; i++) {
            const slide = document.createElement("li");
            slide.classList.add("splide__slide");

            // Add a flexbox container to the slide with a column layout
            let flexContainer = document.createElement("div");
            flexContainer.classList.add("gdl-flex-container");
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
                    let textElementDiv = document.createElement("div");
                    textElementDiv.style.width = "60%";

                    textElementDiv.classList.add("gdl-text");
                    textElementDiv.style.webkitTextStroke = "1px #303030";
                    textElementDiv.style.color = "#FFFFFF";
                    textElementDiv.style.textShadow = "0.1rem 0.15rem 0.1rem #303030";
                    textElementDiv.style.fontFamily = "Quicksand";
                    textElementDiv.style.fontWeight = "800";
                    textElementDiv.style.fontSize = "1.7em";
                    textElementDiv.innerHTML = textElement.textContentAsHTML.replace("2.25em", "28px");
                    flexContainer.appendChild(textElementDiv);
                } else if (visualElement.type == "image") {
                    let imageElement: ImageElement = visualElement;

                    let imageElementDiv = document.createElement("div");
                    imageElementDiv.classList.add("gdl-image");

                    let imageElementImg = document.createElement("img");
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
