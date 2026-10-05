import { effect, inject, Service, signal, untracked } from '@angular/core';
import { NetworkService } from '@wawjs/ngx-http';
import { waitForPendingWrites } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

export type SyncState = 'online' | 'offline' | 'syncing' | 'synced';

/** How long the "synced" confirmation stays visible. */
const SYNCED_NOTICE_MS = 3000;

/**
 * Connection and sync state for the whole app. Firestore queues writes in its persistent cache while offline;
 * this only reports it: `offline` while the network probes fail (see `provideNgxHttp` in app.config), `syncing`
 * until the queued writes are acknowledged by the server after reconnecting, then briefly `synced`.
 * Connectivity comes from `NetworkService` probes rather than the browser's `online` event, which stays true on
 * Wi-Fi without internet.
 */
@Service()
export class SyncStatusService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _network = inject(NetworkService);

	private readonly _state = signal<SyncState>('online');
	private _timer?: ReturnType<typeof setTimeout>;

	readonly state = this._state.asReadonly();

	constructor() {
		effect(() => {
			const reachable = this._network.status() !== 'none';
			untracked(() => (reachable ? this._onReachable() : this._onUnreachable()));
		});
	}

	private _onUnreachable(): void {
		clearTimeout(this._timer);
		this._state.set('offline');
	}

	private async _onReachable(): Promise<void> {
		// Nothing to do when we were never offline (or are already syncing).
		if (this._state() !== 'offline') return;
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
