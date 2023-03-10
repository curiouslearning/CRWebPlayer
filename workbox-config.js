module.exports = {
    globDirectory: 'dist/',
    globPatterns: [
        '**/*.{html,js,css}',
        // 'public/images/*.{png,jpg,gif,svg}',
        'fonts/*.{woff,woff2,eot,ttf,otf}'
    ],
    swDest: 'dist/sw.js',
    runtimeCaching: [
        {
            urlPattern: new RegExp('^https://curiousreader.curiourcontent.org'),
            handler: 'NetworkFirst',
            options: {
                cacheName: 'CRCache',
            }
        }
    ]
};