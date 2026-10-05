import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { doc, onSnapshot, updateDoc, type DocumentData } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { HotelService } from './hotel.service';
import { PAYMENT_METHODS, type PaymentMethod } from './payments.service';

/** The hotel profile and desk defaults edited on the Settings page (`hotels/{hotelId}`, see firestore.rules). */
export interface HotelSettings {
	name: string;
	city: string;
	phone: string;
	email: string;
	address: string;
	/** `HH:MM` defaults for new bookings. */
	checkInTime: string;
	checkOutTime: string;
	/** Payment methods offered at the desk; never empty. */
	paymentMethods: PaymentMethod[];
	/** Shown to guests who pay by bank transfer. */
	bankDetails: string;
}

export const DEFAULT_CHECK_IN = '14:00';
export const DEFAULT_CHECK_OUT = '12:00';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const time = (value: unknown, fallback: string): string => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback);

function toSettings(data: DocumentData): HotelSettings {
	const known = PAYMENT_METHODS.map((m) => m.value);
	const methods = Array.isArray(data['paymentMethods']) ? data['paymentMethods'].filter((m: unknown): m is PaymentMethod => known.includes(m as PaymentMethod)) : [];
	return {
		name: str(data['name']),
		city: str(data['city']),
		phone: str(data['phone']),
		email: str(data['email']),
		address: str(data['address']),
		checkInTime: time(data['checkInTime'], DEFAULT_CHECK_IN),
		checkOutTime: time(data['checkOutTime'], DEFAULT_CHECK_OUT),
		// A hotel that never chose offers every method.
		paymentMethods: methods.length ? methods : known,
		bankDetails: str(data['bankDetails']),
	};
}

/**
 * Settings of the active hotel, kept live from `hotels/{hotelId}`. Any page may read `settings()`
 * (it is null until the first snapshot, so use the `checkIn`/`checkOut`/`methods` helpers for defaults).
 */
@Service()
export class HotelSettingsService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _hotel = inject(HotelService);

	readonly settings = signal<HotelSettings | null>(null);
	readonly checkIn = computed(() => this.settings()?.checkInTime ?? DEFAULT_CHECK_IN);
	readonly checkOut = computed(() => this.settings()?.checkOutTime ?? DEFAULT_CHECK_OUT);
	/** Payment methods the hotel offers, in the standard order. */
	readonly methods = computed(() => {
		const enabled = this.settings()?.paymentMethods;
		return enabled ? PAYMENT_METHODS.filter((m) => enabled.includes(m.value)) : PAYMENT_METHODS;
	});

	constructor() {
		effect((onCleanup) => {
			const hotelId = this._hotel.activeHotelId();
			const firestore = this._firebase.firestore;
			untracked(() => this.settings.set(null));
			if (!hotelId || !firestore) return;
			const stop = onSnapshot(
				doc(firestore, 'hotels', hotelId),
				(snapshot) => {
					if (snapshot.exists()) this.settings.set(toSettings(snapshot.data()));
				},
				(error) => console.error('Hotel settings listener failed', error),
			);
			onCleanup(stop);
		});
	}

	/** Saves changed fields; the sidebar's hotel name and city follow. Rejects if the rules refuse it. */
	async save(hotelId: string, patch: Partial<HotelSettings>): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		await updateDoc(doc(firestore, 'hotels', hotelId), { ...patch });
		const current = this.settings();
		if (patch.name !== undefined || patch.city !== undefined) {
			this._hotel.updateSummary(hotelId, patch.name ?? current?.name ?? '', patch.city ?? current?.city ?? '');
		}
	}
}
