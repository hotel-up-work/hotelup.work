import { Service, computed, effect, inject, signal } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { clearRealHotel, getRealHotelId, getStoredHotels, HotelSummary, setRealHotelId, setStoredHotels } from '../../shared/hotel';
import { getRealRole } from '../../shared/role';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

/**
 * The hotels a signed-in Firebase Auth user owns (`hotels/{hotelId}.ownerUids`) and which one
 * is active. One account can own many hotels; every hotel-scoped page reads `activeHotelId`
 * and reacts when the sidebar switcher changes it. Hotel documents are created manually
 * (console or an admin script) when an Owner account is provisioned — no self-service yet.
 */
@Service()
export class HotelService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _auth = inject(AuthService);

	readonly hotels = signal<HotelSummary[]>(getStoredHotels());
	readonly activeHotelId = signal<string | null>(getRealHotelId());
	readonly activeHotel = computed(() => this.hotels().find((hotel) => hotel.id === this.activeHotelId()) ?? null);

	constructor() {
		// Refresh the cached list once Firebase restores the session, so hotels added or
		// removed since the last login show up without signing in again.
		effect(() => {
			const user = this._auth.user();
			if (user && getRealRole()) this.load(user.uid).catch(() => {
				/* keep the cached list; the next login refreshes it */
			});
		});
	}

	/** Loads the account's hotels and keeps the active one if still accessible. Returns the list. */
	async load(uid: string): Promise<HotelSummary[]> {
		const firestore = this._firebase.firestore;
		if (!firestore) return [];

		const snapshot = await getDocs(query(collection(firestore, 'hotels'), where('ownerUids', 'array-contains', uid)));
		const hotels = snapshot.docs
			.map((docSnapshot) => {
				const data = docSnapshot.data();
				return { id: docSnapshot.id, name: data['name'] || docSnapshot.id, city: data['city'] ?? '' };
			})
			.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

		this.hotels.set(hotels);
		setStoredHotels(hotels);
		const current = this.activeHotelId();
		if (!hotels.some((hotel) => hotel.id === current)) {
			if (hotels.length) this.select(hotels[0].id);
			else this.activeHotelId.set(null);
		}
		return hotels;
	}

	/** Applies a rename from the Settings page to the cached list, so the sidebar updates without a reload. */
	updateSummary(hotelId: string, name: string, city: string): void {
		const hotels = this.hotels().map((hotel) => (hotel.id === hotelId ? { ...hotel, name: name || hotel.name, city } : hotel));
		this.hotels.set(hotels);
		setStoredHotels(hotels);
	}

	select(hotelId: string): void {
		this.activeHotelId.set(hotelId);
		setRealHotelId(hotelId);
	}

	clear(): void {
		this.hotels.set([]);
		this.activeHotelId.set(null);
		clearRealHotel();
	}
}
