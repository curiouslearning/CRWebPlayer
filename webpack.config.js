const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  // Two entries: the app itself, and the service worker source. sw-src.ts
  // needs to go through webpack too so it can `import` from @curiouslearning/sw
  // and workbox-* (it was previously a raw importScripts-CDN file with no
  // bundler at all -- see specs/001-interactive-books-sw-package/research.md §1).
  // Its output (dist/sw-src.js) is an INTERMEDIATE artifact: scripts/inject-sw-manifest.js
  // runs after this build to inject the precache manifest into it and write the
  // final sw.js to the repo root (not dist/ -- a service worker's scope is
  // limited to its own directory, and this one must cover the whole site:
  // BookContent/, interactive-book-static/, etc., not just /dist/).
  entry: {
    app: './App.ts',
    'sw-src': './sw-src.ts',
  },
	devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Curious Reader',
      template: 'index.html',
      filename: 'index.html',
      // Only inject the app bundle -- dist/index.html is an HtmlWebpackPlugin
      // byproduct (the actual served entry is the repo-root index.html, which
      // references ./dist/app.js directly) and must not pull in the sw-src
      // bundle as a page <script>.
      chunks: ['app'],
    }),
  ],
  experiments: {
    topLevelAwait: true,
  },
  devServer: {
    static: {
      directory: path.join(__dirname, '/'),
    },
    compress: true,
    port: 9000,
  },
};
