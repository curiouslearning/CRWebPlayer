module.exports = {
    globDirectory: '/',
    globPatterns: [
        '**/*.{html,js,css}',
        'dist/images/*.{png,jpg,gif,svg}',
        'dist/fonts/*.{woff,woff2,eot,ttf,otf}'
    ],
    globIgnores: [
        'node_modules/**/*',
        'workbox-config.js',
        'webpack.config.js',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'README.md',
        'LICENSE',
        'Helpers/**/*',
        'Parser/**/*',
        'PlayBackEngine/**/*',
        'third-party/**/*',
        '.gitignore'
    ],
    swDest: './sw.js',
    swSrc: 'sw-src.js',
};