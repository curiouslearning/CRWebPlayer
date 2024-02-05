import { initializeApp, FirebaseApp } from "firebase/app";
import { getAnalytics, logEvent, Analytics } from "firebase/analytics";
import { firebaseConfig } from "./config";

export class FirebaseAnalyticsManager {
  public static instance: FirebaseAnalyticsManager;
  public firebaseApp: FirebaseApp;
  public firebaseAnalytics: Analytics;

  public constructor() {
    try {
      this.firebaseApp = initializeApp(firebaseConfig);
      this.firebaseAnalytics = getAnalytics(this.firebaseApp);
    } catch (error) {
      console.error("Error while initializing Firebase:", error);
    }
  }

  public static getInstance(): FirebaseAnalyticsManager {
    if (!FirebaseAnalyticsManager.instance) {
      FirebaseAnalyticsManager.instance = new FirebaseAnalyticsManager();
    }
    return FirebaseAnalyticsManager.instance;
  }

  public logEvents(eventName: string, event: object): void {
    try {
      console.log(`Sending custom event ${eventName} with data:`, event);
      logEvent(this.firebaseAnalytics, eventName, event);
    } catch (error) {
      console.error("Error while logging custom event:", error);
    }
  }
}
