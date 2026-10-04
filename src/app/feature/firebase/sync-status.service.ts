import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { waitForPendingWrites } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

export type SyncState = 'online' | 'offline' | 'syncing' | 'synced';

/** How long the "synced" confirmation stays visible. */
const SYNCED_NOTICE_MS = 3000;

/**
 * Connection and sync state for the whole app. Firestore queues writes in its persistent cache while offline;
 * this only reports it: `offline` while the browser has no network, `syncing` until the queued writes are
 * acknowledged by the server after reconnecting, then briefly `synced`.
 */
@Service()
export class SyncStatusService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

	private readonly _state = signal<SyncState>('online');
	private _timer?: ReturnType<typeof setTimeout>;
	private _started = false;

	readonly state = this._state.asReadonly();

	/** Starts listening to the browser's connection events. Safe to call more than once; no-op during SSR. */
	start(): void {
		if (!this._isBrowser || this._started) return;
		this._started = true;
		if (!navigator.onLine) this._state.set('offline');
		window.addEventListener('offline', () => this._goOffline());
		window.addEventListener('online', () => void this._goOnline());
	}

	private _goOffline(): void {
		clearTimeout(this._timer);
		this._state.set('offline');
	}

	private async _goOnline(): Promise<void> {
		clearTimeout(this._timer);
		const firestore = this._firebase.firestore;
		if (!firestore) {
			this._state.set('online');
			return;
		}
		this._state.set('syncing');
		try {
			await waitForPendingWrites(firestore);
		} catch {
			// A write the server rejected rejects here too; the connection itself is back.
		}
		// The connection may have dropped again while waiting.
		if (this._state() !== 'syncing') return;
		this._state.set('synced');
		this._timer = setTimeout(() => this._state.set('online'), SYNCED_NOTICE_MS);
	}
}
