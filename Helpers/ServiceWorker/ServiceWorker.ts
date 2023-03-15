// Service Worker helper class for working with WorkBox functionalities
import { skipWaiting, clientsClaim } from 'workbox-core';
import { Workbox } from 'workbox-window';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

export class CRServiceWorker {

    cacheNameTag: string;

    constructor() {
        this.cacheNameTag = "CRCache";
    }

    InitializeAndRegister(): void {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then((registration) => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                }, (err) => {
                    console.log('ServiceWorker registration failed: ', err);
                });
                navigator.serviceWorker.addEventListener('install', (event) => {
                    console.log('ServiceWorker installed!');
                    skipWaiting();
                });
                navigator.serviceWorker.addEventListener('activate', (event) => {
                    console.log('ServiceWorker activated!');
                    clientsClaim();
                });
                navigator.serviceWorker.addEventListener('fetch', (event) => {
                    console.log('ServiceWorker fetch: ', event);
                });
            });
        }
    }
}