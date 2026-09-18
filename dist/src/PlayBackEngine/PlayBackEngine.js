import { BookType, } from "../Models/Models";
import { Splide } from "@splidejs/splide";
export class PlayBackEngine {
    constructor(imagesPath, audioPath) {
        this.emptyGlowImageTag = "empty_glow_image";
        this.currentlyPlayingAudioElement = null;
        this.currentlyActiveGlowImages = [];
        this.currentlyActiveWord = null;
        this.imagesPath = imagesPath;
        this.audioPath = audioPath;
        this.currentPage = 0;
        let splideRoot = document.querySelector(".splide");
        if (!splideRoot) {
            splideRoot = document.createElement("div");
            splideRoot.classList.add("splide");
            splideRoot.setAttribute("role", "group");
            splideRoot.setAttribute("aria-label", "Splide Basic HTML Example");
            const track = document.createElement("div");
            track.classList.add("splide__track");
            const list = document.createElement("ul");
            list.classList.add("splide__list");
            track.appendChild(list);
            splideRoot.appendChild(track);
            const loadingScreen = document.getElementById("loadingScreen");
            if (loadingScreen && loadingScreen.parentElement) {
                loadingScreen.parentElement.insertBefore(splideRoot, loadingScreen);
            }
            else {
                document.body.appendChild(splideRoot);
            }
        }
        this.splideHandle = new Splide(".splide", {
            fixedHeight: window.innerHeight - 20,
        }).mount();
        this.splideHandle.on("move", (newIndex, oldIndex, destIndex) => {
            if (this.currentPage !== newIndex) {
                console.log("Stopping audio for page from move: " + oldIndex);
                this.transitioningToPage = true;
                this.stopPageAudio(this.book.pages[oldIndex]);
            }
        });
        this.splideHandle.on("moved", (currentIndex, prevIndex, destIndex) => {
            if (this.currentPage !== currentIndex) {
                console.log("Playing audio for page from moved: " + currentIndex);
                this.currentPage = currentIndex;
                this.transitioningToPage = false;
                this.playPageAudio(this.book.pages[currentIndex], currentIndex);
            }
        });
        this.splideHandle.on("drag", (newIndex, oldIndex, destIndex) => {
            if (this.currentPage !== newIndex) {
                console.log("Stopping audio for page from drag: " + oldIndex);
                this.transitioningToPage = true;
                this.stopPageAudio(this.book.pages[oldIndex]);
            }
        });
        this.splideHandle.on("dragged", (currentIndex, prevIndex, destIndex) => {
            if (this.currentPage !== currentIndex) {
                console.log("Playing audio for page from dragged: " + currentIndex);
                this.currentPage = currentIndex;
                this.transitioningToPage = false;
                this.playPageAudio(this.book.pages[currentIndex], currentIndex);
            }
        });
        this.addPageResizeListener();
        this.addMinimzationListener();
    }
    addMinimzationListener() {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.playPageAudio(this.book.pages[this.currentPage], this.currentPage);
            }
            else {
                this.stopPageAudio(this.book.pages[this.currentPage]);
            }
        });
    }
    stopPageAudio(page) {
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement = visualElement;
                let audioElementDom = document.getElementById(audioElement.domID);
                audioElementDom.pause();
                audioElementDom.currentTime = 0;
                clearInterval(this.currentPageAutoPlayerInterval);
                clearTimeout(this.currentGlowImageTimeout);
                for (let j = 0; j < audioElement.audioTimestamps.timestamps.length; j++) {
                    let wordElement = document.getElementById(audioElement.domID + "_word_" + j);
                    if (wordElement) {
                        wordElement.classList.remove("cr-clickable-word-active");
                        wordElement.style.color = "white";
                    }
                }
                for (let i = 0; i < this.currentlyActiveGlowImages.length; i++) {
                    this.currentlyActiveGlowImages[i].style.boxShadow = "transparent 0px 0px 20px 20px";
                }
                this.currentlyActiveGlowImages = Array();
                this.currentlyActiveWord = null;
            }
        }
    }
    resolveCurrentWordIndex(timestamps, currentTime, searchStartHint) {
        let idx = searchStartHint < 0 ? 0 : searchStartHint;
        while (idx < timestamps.length - 1 && currentTime >= timestamps[idx + 1].startTimestamp) {
            idx++;
        }
        while (idx > 0 && currentTime < timestamps[idx].startTimestamp) {
            idx--;
        }
        return idx;
    }
    playPageAudio(page, pageIndex) {
        console.log("Attempting to play audio for page: " + pageIndex);
        console.log("Book has: " + this.book.pages.length + " pages");
        console.log("The page has " + page.visualElements.length + " visual elements");
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement = visualElement;
                console.log("Found the audio element in page's visual elements: " + audioElement.audioSrc);
                console.log("Does the audio element have timestamps? " + (audioElement.audioTimestamps !== undefined ? "Yes" : "No"));
                console.log("Audio element domID: " + audioElement.domID);
                let audioElementDom = document.getElementById(audioElement.domID);
                console.log("Audio element dom is null or undefined? " + (audioElementDom === null || audioElementDom === undefined ? "Yes" : "No"));
                audioElementDom.play();
                this.currentlyPlayingAudioElement = audioElementDom;
                if (this.currentlyActiveWord !== null) {
                    this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
                    this.currentlyActiveWord.style.color = "white";
                    this.currentlyActiveWord = null;
                }
                let currentIndex = -1;
                console.log("Starting the auto player interval for word highlighting with 60ms interval");
                this.currentPageAutoPlayerInterval = setInterval(() => {
                    var _a;
                    let timestamps = (_a = audioElement.audioTimestamps) === null || _a === void 0 ? void 0 : _a.timestamps;
                    if (timestamps === undefined || timestamps.length === 0) {
                        return;
                    }
                    let currentTime = audioElementDom.currentTime;
                    let newIndex = this.resolveCurrentWordIndex(timestamps, currentTime, currentIndex);
                    if (newIndex !== currentIndex) {
                        if (this.currentlyActiveWord !== null) {
                            this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
                            this.currentlyActiveWord.style.color = "white";
                        }
                        let wordElement = document.getElementById(audioElement.domID + "_word_" + newIndex);
                        if (wordElement) {
                            wordElement.classList.add("cr-clickable-word-active");
                            wordElement.style.color = audioElement.glowColor;
                            this.currentlyActiveWord = wordElement;
                        }
                        currentIndex = newIndex;
                        this.enableConnectedGraphicHighlighting(pageIndex, currentIndex);
                    }
                    if (currentTime >= timestamps[timestamps.length - 1].endTimestamp - 0.1) {
                        if (this.currentlyActiveWord !== null) {
                            this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
                            this.currentlyActiveWord.style.color = "white";
                            this.currentlyActiveWord = null;
                        }
                        this.currentlyPlayingAudioElement = null;
                        clearInterval(this.currentPageAutoPlayerInterval);
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
    initializeBook(book) {
        this.book = book;
        this.currentBookType = book.bookType;
        this.numberOfPages = book.pages.length;
        if (this.currentBookType === BookType.CuriousReader) {
            this.initializeCuriousReaderBook(book);
        }
        else if (this.currentBookType === BookType.GDL) {
            this.initializeGDLBook(book);
        }
    }
    initializeCuriousReaderBook(book) {
        this.numberOfPages = book.pages.length;
        for (let i = 0; i < book.pages.length; i++) {
            const slideLi = document.createElement("li");
            const slide = document.createElement("div");
            slideLi.style.display = "flex";
            slideLi.style.justifyContent = "center";
            slideLi.style.alignItems = "center";
            slide.style.position = "relative";
            slide.style.width = "90%";
            slide.style.height = "90%";
            slide.style.top = "-4%";
            slideLi.appendChild(slide);
            slideLi.classList.add("splide__slide");
            let sentenceInitializedByAudio = false;
            for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                let visualElement = book.pages[i].visualElements[j];
                if (visualElement.type == "image") {
                    let imageElement = visualElement;
                    let pageIndex = i;
                    slide.appendChild(this.createImageContainer(pageIndex, imageElement, j));
                }
                else if (visualElement.type == "audio") {
                    sentenceInitializedByAudio = true;
                    let audioElement = visualElement;
                    let textElement = null;
                    for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                        let visualElement = book.pages[i].visualElements[j];
                        if (visualElement.type == "text") {
                            textElement = visualElement;
                            break;
                        }
                    }
                    let imageElement = null;
                    for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                        let visualElement = book.pages[i].visualElements[j];
                        if (visualElement.type == "image") {
                            imageElement = visualElement;
                            break;
                        }
                    }
                    if (textElement) {
                        let audioAndTextDivs = this.createAudioAndTextContainers(i, audioElement, textElement, imageElement);
                        slide.appendChild(audioAndTextDivs[0]);
                        slide.appendChild(audioAndTextDivs[1]);
                    }
                    else {
                        slide.appendChild(this.createAudioContainer(audioElement));
                    }
                }
                this.splideHandle.add(slideLi);
            }
            if (!sentenceInitializedByAudio) {
                for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                    let visualElement = book.pages[i].visualElements[j];
                    if (visualElement.type == "text") {
                        let textElement = visualElement;
                        slide.appendChild(this.createTextContainer(textElement));
                    }
                }
            }
        }
    }
    createTextContainer(textElement) {
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
        if (this.book.bookName.includes("ComeCome") ||
            this.book.bookName.includes("ILove") ||
            this.book.bookName.includes("GuessWhatIAm") ||
            this.book.bookName.includes("TheUmbrellas") ||
            this.book.bookName.includes("IAmFlying")) {
            textElementDiv.style.top = textElement.positionY + "%";
            textElementDiv.style.left = "0%";
            textElementDiv.style.width = "100%";
            textElementDiv.style.height = textElement.height + "%";
            textElementDiv.style.textAlign = "center";
        }
        else {
            textElementDiv.style.top = textElement.positionY + "%";
            textElementDiv.style.left = textElement.positionX + "%";
            textElementDiv.style.width = textElement.width + "%";
            textElementDiv.style.height = textElement.height + "%";
        }
        textElementDiv.innerHTML = textElement.textContentAsHTML.replace(/font-size:[^;]+;/g, "");
        return textElementDiv;
    }
    createImageContainer(pageIndex, imageElement, elementIndex) {
        let imageElementDiv = document.createElement("div");
        imageElementDiv.style.position = "absolute";
        if (this.book.bookName.includes("ComeCome") ||
            this.book.bookName.includes("ILove") ||
            this.book.bookName.includes("GuessWhatIAm") ||
            this.book.bookName.includes("TheUmbrellas") ||
            this.book.bookName.includes("IAmFlying")) {
            if (imageElement.imageSource === this.emptyGlowImageTag) {
                if (imageElement.positionX <= 42) {
                    imageElementDiv.style.left = imageElement.positionX + 10 + "%";
                }
                else if (imageElement.positionX >= 70) {
                    imageElementDiv.style.left = imageElement.positionX - 10 + "%";
                }
                else {
                    imageElementDiv.style.left = imageElement.positionX + "%";
                }
                imageElementDiv.style.width = imageElement.width * 0.7 + "%";
                imageElementDiv.style.height = imageElement.height * 0.7 + "%";
            }
            else {
                imageElementDiv.style.left = imageElement.positionX + 10 + "%";
                imageElementDiv.style.width = imageElement.width * 0.8 + "%";
                imageElementDiv.style.height = imageElement.height * 0.8 + "%";
            }
            imageElementDiv.style.top = imageElement.positionY + "%";
        }
        else {
            imageElementDiv.style.top = imageElement.positionY + "%";
            imageElementDiv.style.left = imageElement.positionX + "%";
            imageElementDiv.style.width = imageElement.width + "%";
            imageElementDiv.style.height = imageElement.height + "%";
        }
        if (imageElement.imageSource === this.emptyGlowImageTag) {
            imageElementDiv.classList.add("cr-image-empty-glow");
            if (imageElement.domID === undefined || imageElement.domID === null || imageElement.domID === "") {
                const id = "img" + pageIndex + "_" + elementIndex;
                imageElementDiv.id = id;
                imageElementDiv.addEventListener("click", () => {
                    this.handleStandaloneGlowImageClick(pageIndex, id);
                });
            }
            else {
                imageElementDiv.classList.add(imageElement.domID);
                imageElementDiv.addEventListener("click", () => {
                    this.handleGlowImageClick(pageIndex, imageElement.domID.split("_")[1]);
                });
            }
        }
        else {
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
    createAudioContainer(audioElement) {
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
                let wordTimestampElement = audioElement.audioTimestamps.timestamps[i];
                let wordAudioElement = document.createElement("audio");
                wordAudioElement.id = wordTimestampElement.domID;
                wordAudioElement.src = this.audioPath + wordTimestampElement.audioSrc.replace("audios/", "");
                wordAudioElement.controls = false;
                audioElementDiv.appendChild(wordAudioElement);
            }
        }
        return audioElementDiv;
    }
    createAudioAndTextContainers(pageIndex, audioElement, textElement, imageElement) {
        let audioAndTextArray = Array();
        let audioElementDiv = document.createElement("div");
        audioElementDiv.classList.add("cr-audio");
        audioElementDiv.style.position = "absolute";
        let pageAudio = document.createElement("audio");
        pageAudio.id = audioElement.domID;
        pageAudio.src = this.audioPath + audioElement.audioSrc.replace("audios/", "");
        pageAudio.controls = false;
        audioElementDiv.appendChild(pageAudio);
        let sentenceArrayTrimmed = Array();
        if (audioElement.audioTimestamps !== undefined) {
            for (let i = 0; i < audioElement.audioTimestamps.timestamps.length; i++) {
                let wordTimestampElement = audioElement.audioTimestamps.timestamps[i];
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
        if (this.book.bookName.includes("ComeCome") ||
            this.book.bookName.includes("ILove") ||
            this.book.bookName.includes("GuessWhatIAm") ||
            this.book.bookName.includes("TheUmbrellas") ||
            this.book.bookName.includes("IAmFlying")) {
            textElement.width = 100;
            textElement.positionX = 0;
            textElement.positionY = 81;
            textElementDiv.style.top = "81%";
        }
        else {
            textElementDiv.style.top = textElement.positionY + "%";
            textElementDiv.style.height = textElement.height + "%";
        }
        if (imageElement.positionX > 28 && textElement.width < 88 && textElement.positionY < 65) {
            textElementDiv.style.left = textElement.positionX + "%";
            textElementDiv.style.width = "42%";
        }
        else if (imageElement.positionX <= 28 && textElement.width < 88) {
            textElementDiv.style.left = textElement.positionX + 2 + "%";
            textElementDiv.style.width = textElement.width + "%";
        }
        else {
            textElementDiv.style.width = "100%";
        }
        let sentenceParagraph = document.createElement("p");
        if (audioElement.audioTimestamps !== undefined && audioElement.audioTimestamps.timestamps.length > 15) {
            sentenceParagraph.classList.add("cr-sentence-mini-s");
        }
        else if (audioElement.audioTimestamps !== undefined && audioElement.audioTimestamps.timestamps.length > 10 &&
            audioElement.audioTimestamps.timestamps.length <= 15) {
            sentenceParagraph.classList.add("cr-sentence-mini");
        }
        sentenceParagraph.style.textAlign = "center";
        sentenceParagraph.style.margin = "0px";
        for (let i = 0; i < sentenceArrayTrimmed.length; i++) {
            let clickableWordElement = document.createElement("div");
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
    handleStandaloneGlowImageClick(pageIndex, id) {
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
        let glowDiv = document.getElementById(id);
        this.currentlyActiveGlowImages.push(glowDiv);
        glowDiv.style.boxShadow = "orange 0px 0px 20px 20px";
        this.currentGlowImageTimeout = setTimeout(() => {
            let glowDiv = document.getElementById(id);
            glowDiv.style.boxShadow = "transparent 0px 0px 20px 20px";
        }, 600);
    }
    handleGlowImageClick(pageIndex, wordIndex) {
        let wordIndexNumber = parseInt(wordIndex);
        this.handleInteractiveWordClick(pageIndex, wordIndexNumber);
    }
    enableConnectedGraphicHighlighting(pageIndex, wordIndex) {
        this.handleInteractiveWordClick(pageIndex, wordIndex, true);
    }
    handleInteractiveWordClick(pageIndex, wordIndex, glowImageOnly = false) {
        if (this.currentlyPlayingAudioElement !== null && !glowImageOnly) {
            this.currentlyPlayingAudioElement.pause();
            this.currentlyPlayingAudioElement.currentTime = 0;
            clearInterval(this.currentPageAutoPlayerInterval);
            clearTimeout(this.currentWordPlayingTimeout);
            if (this.currentlyActiveWord !== null) {
                this.currentlyActiveWord.classList.remove("cr-clickable-word-active");
                this.currentlyActiveWord.style.color = "white";
            }
        }
        clearTimeout(this.currentGlowImageTimeout);
        if (this.currentlyActiveGlowImages.length > 0) {
            for (let i = 0; i < this.currentlyActiveGlowImages.length; i++) {
                this.currentlyActiveGlowImages[i].style.boxShadow = "transparent 0px 0px 20px 20px";
            }
        }
        this.currentlyActiveGlowImages = Array();
        let page = this.book.pages[pageIndex];
        for (let i = 0; i < page.visualElements.length; i++) {
            let visualElement = page.visualElements[i];
            if (visualElement.type === "audio") {
                let audioElement = visualElement;
                let wordAudioElement = document.getElementById(audioElement.audioTimestamps.timestamps[wordIndex].domID);
                if (!glowImageOnly) {
                    let wordElement = document.getElementById(audioElement.domID + "_word_" + wordIndex);
                    this.currentlyActiveWord = wordElement;
                    wordElement.classList.add("cr-clickable-word-active");
                    wordElement.style.color = audioElement.glowColor;
                    this.currentWordPlayingTimeout = setTimeout(() => {
                        wordElement.classList.remove("cr-clickable-word-active");
                        wordElement.style.color = "white";
                    }, 600);
                }
                let connectedGlowImageClass = "img" + audioElement.domID + "_" + wordIndex;
                let connectedGlowImages = document.getElementsByClassName(connectedGlowImageClass);
                for (let i = 0; i < connectedGlowImages.length; i++) {
                    let glowDiv = connectedGlowImages[i];
                    this.currentlyActiveGlowImages.push(glowDiv);
                    glowDiv.style.boxShadow = audioElement.glowColor + " 0px 0px 20px 20px";
                }
                this.currentGlowImageTimeout = setTimeout(() => {
                    for (let i = 0; i < connectedGlowImages.length; i++) {
                        let glowDiv = connectedGlowImages[i];
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
    initializeGDLBook(book) {
        for (let i = 0; i < book.pages.length; i++) {
            const slide = document.createElement("li");
            slide.classList.add("splide__slide");
            let flexContainer = document.createElement("div");
            flexContainer.classList.add("gdl-flex-container");
            flexContainer.style.display = "flex";
            flexContainer.style.flexDirection = "column";
            flexContainer.style.justifyContent = "center";
            flexContainer.style.alignItems = "center";
            flexContainer.style.height = "100%";
            flexContainer.style.width = "100%";
            slide.appendChild(flexContainer);
            for (let j = 0; j < book.pages[i].visualElements.length; j++) {
                let visualElement = book.pages[i].visualElements[j];
                if (visualElement.type == "text") {
                    let textElement = visualElement;
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
                }
                else if (visualElement.type == "image") {
                    let imageElement = visualElement;
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
        if (this.transitioningToPage)
            return;
        if (this.currentPage < this.numberOfPages) {
            this.currentPage++;
        }
        this.transitionToPage(this.currentPage);
    }
    goToPreviousPage() {
        if (this.transitioningToPage)
            return;
        if (this.currentPage > 0) {
            this.currentPage--;
        }
        this.transitionToPage(this.currentPage);
    }
    transitionToPage(pageNumber) {
        this.transitioningToPage = true;
    }
}
//# sourceMappingURL=PlayBackEngine.js.map