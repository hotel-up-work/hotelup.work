import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Analytics, isSupported as isAnalyticsSupported, getAnalytics } from 'firebase/analytics';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebase.config';

/** Lazily inits Firebase in the browser only; every getter is a no-op during prerender/SSR. */
@Service()
export class FirebaseService {
	private readonly _platformId = inject(PLATFORM_ID);

	private _app?: FirebaseApp;
	private _firestore?: Firestore;
	private _auth?: Auth;
	private _analytics?: Analytics;

	get firestore(): Firestore | null {
		if (!isPlatformBrowser(this._platformId)) return null;
		// Persistent cache: reads and queued writes survive offline and reloads; shared across tabs.
		this._firestore ??= initializeFirestore(this._app ??= initializeApp(FIREBASE_CONFIG), {
			localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
		});
		return this._firestore;
	}

	get auth(): Auth | null {
		if (!isPlatformBrowser(this._platformId)) return null;
		this._auth ??= getAuth(this._app ??= initializeApp(FIREBASE_CONFIG));
		return this._auth;
	}

	async analytics(): Promise<Analytics | null> {
		if (!isPlatformBrowser(this._platformId)) return null;
		if (this._analytics) return this._analytics;
		if (!(await isAnalyticsSupported())) return null;
		this._analytics = getAnalytics(this._app ??= initializeApp(FIREBASE_CONFIG));
		return this._analytics;
	}
}
