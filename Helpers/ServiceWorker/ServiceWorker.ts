// Service Worker helper class for working with WorkBox functionalities
import { Workbox } from 'workbox-window';
import { registerRoute } from 'workbox-routing';

export class CRServiceWorker {

    cacheNameTag: string;

    constructor() {
        this.cacheNameTag = "CRCache";
    }

    Initialize() {

    }
}