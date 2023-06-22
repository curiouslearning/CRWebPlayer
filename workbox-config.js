module.exports = {
    globDirectory: "./",
    globPatterns: ["**/*.{wav,mp3,WAV,png,webp,otf,jpg,js,json,css,html}"],
    swDest: "sw.js",
    swSrc: "sw-src.js",
    globIgnores:[
        "BookContent/**/*", 
        "node_modules/**/*",
        "workbox-config.js",
        "sw-src.js",
        "tsconfig.json",
        "webpack.config.js",
        "package.json",
        "package-lock.json",
        "README.md",
        "workbox-7f917042.js",
        "workbox-7f917042.js.map",
    ],
};