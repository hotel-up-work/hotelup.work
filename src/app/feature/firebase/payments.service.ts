import { Service, inject } from '@angular/core';
import {
	collection,
	doc,
	increment,
	onSnapshot,
	serverTimestamp,
	Timestamp,
	writeBatch,
	type DocumentData,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import type { BookingRecord } from './bookings.service';
import { FirebaseService } from './firebase.service';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'online' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
	{ value: 'cash', label: 'Готівка' },
	{ value: 'card', label: 'Картка' },
	{ value: 'transfer', label: 'Банківський переказ' },
	{ value: 'online', label: 'Онлайн' },
	{ value: 'other', label: 'Інше' },
];

export const methodLabel = (method: PaymentMethod) => PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;

/** What is recorded when money is received (`hotels/{hotelId}/payments/{id}`, see firestore.rules). */
export interface PaymentInput {
	amount: number;
	method: PaymentMethod;
	note: string;
	/** ISO `YYYY-MM-DD`: the day the money was received. */
	occurredOn: string;
}

export interface PaymentRecord {
	id: string;
	bookingId: string;
	/** Copies of the booking's guest and room at that time, so the entry stays readable on its own. */
	guestName: string;
	roomNumber: string;
	amount: number;
	method: PaymentMethod;
	note: string;
	occurredOn: string;
	recordedBy: string;
	recordedByUid: string;
	createdAt: Date | null;
}

const METHODS = PAYMENT_METHODS.map((m) => m.value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function toPayment(id: string, data: DocumentData): PaymentRecord {
	return {
		id,
		bookingId: str(data['bookingId']),
		guestName: str(data['guestName']),
		roomNumber: str(data['roomNumber']),
		amount: typeof data['amount'] === 'number' ? data['amount'] : 0,
		method: METHODS.includes(data['method']) ? data['method'] : 'other',
		note: str(data['note']),
		occurredOn: str(data['occurredOn']),
		recordedBy: str(data['recordedBy']),
		recordedByUid: str(data['recordedByUid']),
		createdAt: (data['createdAt'] as Timestamp | undefined)?.toDate() ?? null,
	};
}

/** `YYYY-MM-DD` in the browser's time zone. */
export const localDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Who is recording: shown in the list, and used to give roles without hotel-wide finance only their own entries. */
export interface Recorder {
	name: string;
	uid: string;
}

/** The fields of a payment document, as written by every path that records money. */
export function paymentFields(
	booking: { id: string; guestName: string; roomNumber: string },
	input: PaymentInput,
	recorder: Recorder,
) {
	return {
		bookingId: booking.id,
		guestName: booking.guestName,
		roomNumber: booking.roomNumber,
		amount: input.amount,
		type: 'payment' as const,
		method: input.method,
		...(input.note.trim() ? { note: input.note.trim() } : {}),
		occurredOn: input.occurredOn,
		recordedBy: recorder.name,
		recordedByUid: recorder.uid,
		createdAt: serverTimestamp(),
	};
}

/**
 * A hotel's payment journal: `hotels/{hotelId}/payments`. Entries are never edited or deleted (firestore.rules);
 * a mistake is corrected with another entry. A booking's `paid` is the running total of its entries: recording
 * a payment adds to it in the same batch, and money taken at booking time is written by `BookingsService.add`.
 */
@Service()
export class PaymentsService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _auth = inject(AuthService);

	/** The signed-in staff member, for the "recorded by" columns. */
	recorder(): Recorder {
		const user = this._auth.user();
		return { name: user?.displayName || user?.email || 'Співробітник', uid: user?.uid ?? '' };
	}

	/** Live payment list. Returns an unsubscribe function. */
	listen(hotelId: string, onChange: (payments: PaymentRecord[]) => void, onError: (error: Error) => void = () => {}): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};
		return onSnapshot(
			collection(firestore, 'hotels', hotelId, 'payments'),
			(snapshot) =>
				onChange(
					snapshot.docs
						.map((d) => toPayment(d.id, d.data()))
						.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
				),
			onError,
		);
	}

	/** Records money received for a booking and adds it to the booking's `paid`, atomically. */
	async record(hotelId: string, booking: { id: string; guestName: string; roomNumber: string }, input: PaymentInput): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const batch = writeBatch(firestore);
		batch.set(doc(collection(firestore, 'hotels', hotelId, 'payments')), paymentFields(booking, input, this.recorder()));
		// increment() keeps two people recording at the same moment from overwriting each other.
		batch.update(doc(firestore, 'hotels', hotelId, 'bookings', booking.id), { paid: increment(input.amount), updatedAt: serverTimestamp() });
		await batch.commit();
	}

	/**
	 * Journal entries for money that bookings already show as paid but that has none (taken before the journal
	 * existed). The booking's `paid` is not changed. Returns how many entries were written.
	 */
	async backfill(hotelId: string, items: { booking: BookingRecord; amount: number }[]): Promise<number> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const recorder = this.recorder();
		for (let i = 0; i < items.length; i += 400) {
			const batch = writeBatch(firestore);
			for (const { booking, amount } of items.slice(i, i + 400)) {
				batch.set(
					doc(collection(firestore, 'hotels', hotelId, 'payments')),
					paymentFields(
						{ id: booking.id, guestName: booking.guestName, roomNumber: booking.roomNumber },
						{ amount, method: 'other', note: 'Оплата, внесена до ведення журналу', occurredOn: booking.createdAt ? localDay(booking.createdAt) : booking.checkIn },
						recorder,
					),
				);
			}
			await batch.commit();
		}
		return items.length;
	}
}
