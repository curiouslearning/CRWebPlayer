import {
  mapGdlPathToLocal,
  collectAssetsFromJson,
  buildCrAssetList,
  buildGdlAssetList,
} from "./assetManifest";

describe("mapGdlPathToLocal", () => {
  const basePath = "/interactive-book-static/gdl-1/";

  it("maps an audio file to the audio/ directory", () => {
    expect(mapGdlPathToLocal("/server/x/song.mp3", basePath)).toBe(basePath + "audio/song.mp3");
  });

  it("maps an image/lottie file to the assets/ directory", () => {
    expect(mapGdlPathToLocal("/server/x/cat.png", basePath)).toBe(basePath + "assets/cat.png");
    expect(mapGdlPathToLocal("/server/x/anim.lottie", basePath)).toBe(basePath + "assets/anim.lottie");
  });

  it("returns null for non-audio/non-image extensions", () => {
    expect(mapGdlPathToLocal("/server/x/data.json", basePath)).toBeNull();
  });

  it("returns null for empty, missing, or dotfile filenames", () => {
    expect(mapGdlPathToLocal("", basePath)).toBeNull();
    // filename ".mp3" starts with "." -> rejected
    expect(mapGdlPathToLocal("/server/x/.mp3", basePath)).toBeNull();
  });
});

describe("collectAssetsFromJson", () => {
  const basePath = "/interactive-book-static/gdl-1/";

  it("collects relative, server-absolute, and http asset paths", () => {
    const assets = new Set<string>();
    collectAssetsFromJson(
      { path: "audio/song.mp3", cover: "/srv/hero.webp", remote: "https://cdn.example.com/x.png" },
      assets,
      basePath
    );
    expect(assets.has(basePath + "audio/song.mp3")).toBe(true); // relative -> basePath-prefixed
    expect(assets.has(basePath + "assets/hero.webp")).toBe(true); // server-absolute -> mapped local
    expect(assets.has("https://cdn.example.com/x.png")).toBe(true); // http -> kept verbatim
  });

  it("resolves the logos array, adding .jpg when the logo has no extension", () => {
    const assets = new Set<string>();
    collectAssetsFromJson({ logos: ["partnerA", "partnerB.png"] }, assets, basePath);
    expect(assets.has(basePath + "assets/partnerA.jpg")).toBe(true);
    expect(assets.has(basePath + "assets/partnerB.png")).toBe(true);
  });

  it("prefers the 'path' field over 'url'/'filename' when both exist", () => {
    const assets = new Set<string>();
    collectAssetsFromJson(
      { path: "audio/real.mp3", url: "audio/dupe.mp3", filename: "audio/dupe2.mp3" },
      assets,
      basePath
    );
    expect(assets.has(basePath + "audio/real.mp3")).toBe(true);
    expect(assets.has(basePath + "audio/dupe.mp3")).toBe(false);
    expect(assets.has(basePath + "audio/dupe2.mp3")).toBe(false);
  });

  it("ignores null / non-asset values", () => {
    const assets = new Set<string>();
    collectAssetsFromJson(null, assets, basePath);
    collectAssetsFromJson({ title: "A story", count: 3 }, assets, basePath);
    expect(assets.size).toBe(0);
  });
});

describe("buildCrAssetList", () => {
  it("collects audio + per-word timestamp audio + images, skips empty_glow_image, and appends contentFile last", () => {
    const bookData = {
      bookName: "TestBook",
      pages: [
        {
          visualElements: [
            {
              type: "audio",
              audioSrc: "a1.mp3",
              audioTimestamps: { timestamps: [{ audioSrc: "w1.mp3" }, { audioSrc: "w2.mp3" }] },
            },
            { type: "image", imageSource: "img1.png" },
            { type: "image", imageSource: "empty_glow_image" },
          ],
        },
      ],
    };
    const contentFile = "/BookContent/TestBook/content/content.json";
    const base = "/BookContent/TestBook/content/";

    expect(buildCrAssetList(bookData, contentFile)).toEqual([
      base + "a1.mp3",
      base + "w1.mp3",
      base + "w2.mp3",
      base + "img1.png",
      contentFile,
    ]);
  });
});

describe("buildGdlAssetList", () => {
  const basePath = "/interactive-book-static/gdl-1/";
  const contentFile = basePath + "content.json";

  it("always seeds the core GDL assets even with no content json", () => {
    const list = buildGdlAssetList(null, basePath, contentFile);
    expect(list).toContain(contentFile);
    expect(list).toContain(basePath + "my-lib-style.css");
    expect(list).toContain(basePath + "gdlplayer.umd.js");
  });

  it("collects, normalizes stray-directory paths into assets/, and keeps http + already-correct paths", () => {
    const contentJson = {
      pages: [{ path: "audio/song.mp3" }, { image: "pics/cat.png" }],
      cover: "/srv/hero.webp",
      remote: "https://cdn.example.com/x.png",
    };
    const list = buildGdlAssetList(contentJson, basePath, contentFile);

    expect(list).toContain(basePath + "audio/song.mp3"); // already under audio/ -> kept
    expect(list).toContain(basePath + "assets/cat.png"); // "pics/cat.png" normalized to assets/
    expect(list).toContain(basePath + "assets/hero.webp"); // server-absolute image -> assets/
    expect(list).toContain("https://cdn.example.com/x.png"); // external URL -> kept verbatim
    expect(list).not.toContain(basePath + "pics/cat.png"); // pre-normalization form must be gone
  });
});
