// Service Worker helper class for working with WorkBox functionalities
import { skipWaiting, clientsClaim, } from 'workbox-core';
import { Workbox, } from 'workbox-window';
import { registerRoute, setCatchHandler, } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin, } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';
/// <reference lib="webworker" />

// @ts-ignore WB_MANIFEST is injected by workbox-webpack-plugin
// precacheAndRoute(self.__WB_MANIFEST);

export default null;
// @ts-ignore ServiceWorkerGlobalScope is defined by lib="webworker"
declare let self: ServiceWorkerGlobalScope;

declare global {
  interface ExtendableEvent extends Event {
    waitUntil(fn: Promise<any>): void;
  }
}

export class CRServiceWorker {

    cacheNameTag: string;
    version: string;

    imagesCacheName: string;
    fontsCacheName: string;
    stylesScriptsCacheName: string;
    documentCacheName: string;

    // Expiration Plugins
    stylesScriptsExpirationPlugin: ExpirationPlugin;
    imagesExpirationPlugin: ExpirationPlugin;
    fontsExpirationPlugin: ExpirationPlugin;
    documentExpirationPlugin: ExpirationPlugin;

    constructor() {
        this.cacheNameTag = "CRCache";
        this.version = "v0.0.1";
        this.imagesCacheName = `${this.cacheNameTag}-${this.version}-images`;
        this.fontsCacheName = `${this.cacheNameTag}-${this.version}-fonts`;
        this.stylesScriptsCacheName = `${this.cacheNameTag}-${this.version}-stylesScripts`;
        this.documentCacheName = `${this.cacheNameTag}-${this.version}-document`;

        // Initialize Expiration Plugins
        this.stylesScriptsExpirationPlugin = new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 15 * 24 * 60 * 60, // 15 Days
            purgeOnQuotaError: true
        });
        this.fontsExpirationPlugin = new ExpirationPlugin({
            maxEntries: 5,
            maxAgeSeconds: 180 * 24 * 60 * 60, // 180 Days
        });
        this.imagesExpirationPlugin = new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
        });
        this.documentExpirationPlugin = new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
        });
    }

    InitializeAndRegister(): void {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then((registration) => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                }, (err) => {
                    console.log('ServiceWorker registration failed: ', err);
                });

                // Register CacheFirst Routes
                this.registerCacheFirstRouteUsing("image", this.imagesCacheName, this.imagesExpirationPlugin);
                this.registerCacheFirstRouteUsing("font", this.fontsCacheName, this.fontsExpirationPlugin);
                this.registerCacheFirstRouteUsing("script", this.stylesScriptsCacheName, this.stylesScriptsExpirationPlugin);
                this.registerCacheFirstRouteUsing("style", this.stylesScriptsCacheName, this.stylesScriptsExpirationPlugin);
                this.registerCacheFirstRouteUsing("document", this.documentCacheName, this.documentExpirationPlugin);

                // Add Listeners
                self.addEventListener('install', (event: ExtendableEvent) => {
                    console.log('ServiceWorker installed!');
                    // skipWaiting();
                    event.waitUntil(Promise.all([
                        caches.delete(this.imagesCacheName),
                        caches.delete(this.fontsCacheName),
                        caches.delete(this.stylesScriptsCacheName),
                        caches.delete(this.documentCacheName)
                    ]));
                });
                self.addEventListener('activate', (event: ExtendableEvent) => {
                    console.log('ServiceWorker activated!');
                    clientsClaim();
                });
                self.addEventListener('fetch', (event: ExtendableEvent) => {
                    console.log('ServiceWorker fetch: ', event);
                });
            });
        }
    }

    registerCacheFirstRouteUsing(destination: RequestDestination, cacheName: string, expirationPlugin: ExpirationPlugin): void {
        registerRoute(
            ({ request }) => request.destination === destination,
            new CacheFirst({
                cacheName: cacheName,
                plugins: [
                    expirationPlugin
                ]
            })
        );
    }
}