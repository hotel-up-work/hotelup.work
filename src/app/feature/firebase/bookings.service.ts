import { Service, inject } from '@angular/core';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, Timestamp, updateDoc, type DocumentData } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

export type BookingStatus = 'pending' | 'confirmed' | 'checkedin' | 'checkedout' | 'cancelled';

/** Fields a booking is created with (`hotels/{hotelId}/bookings/{bookingId}`, see firestore.rules). */
export interface BookingInput {
	/** `rooms` document id; `roomNumber` is a copy for display if the room is later removed. */
	roomId: string;
	roomNumber: string;
	guestName: string;
	phone: string;
	email: string;
	/** ISO `YYYY-MM-DD`. Check-out is the departure day, so the room is free for the next stay from it. */
	checkIn: string;
	checkOut: string;
	guests: number;
	total: number;
	paid: number;
	status: BookingStatus;
	source: string;
	notes: string;
	/** `submissions` document id when the booking was created from a website request. */
	submissionId?: string;
	/** `guests` document id; the name and contacts above stay as a copy of the guest at booking time. */
	guestId?: string;
}

export interface BookingRecord extends BookingInput {
	id: string;
	lateCheckoutHour: number | null;
	/** Check-out as originally booked, set when an early check-out shortened the stay. */
	plannedCheckOut?: string;
	createdAt: Date | null;
}

export interface BookingPatch {
	roomId?: string;
	roomNumber?: string;
	checkIn?: string;
	checkOut?: string;
	paid?: number;
	status?: BookingStatus;
	notes?: string;
	lateCheckoutHour?: number | null;
	plannedCheckOut?: string;
}

const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checkedin', 'checkedout', 'cancelled'];

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);

function toBooking(id: string, data: DocumentData): BookingRecord {
	return {
		id,
		roomId: str(data['roomId']),
		roomNumber: str(data['roomNumber']),
		guestName: str(data['guestName']),
		phone: str(data['phone']),
		email: str(data['email']),
		checkIn: str(data['checkIn']),
		checkOut: str(data['checkOut']),
		guests: num(data['guests'], 1),
		total: num(data['total'], 0),
		paid: num(data['paid'], 0),
		status: BOOKING_STATUSES.includes(data['status']) ? data['status'] : 'confirmed',
		source: str(data['source']),
		notes: str(data['notes']),
		submissionId: str(data['submissionId']) || undefined,
		guestId: str(data['guestId']) || undefined,
		lateCheckoutHour: typeof data['lateCheckoutHour'] === 'number' ? data['lateCheckoutHour'] : null,
		plannedCheckOut: str(data['plannedCheckOut']) || undefined,
		createdAt: (data['createdAt'] as Timestamp | undefined)?.toDate() ?? null,
	};
}

/** `YYYY-MM-DD` plus `days` days (calendar days, no time zone). */
export function isoAddDays(date: string, days: number): string {
	const d = new Date(date + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * What checking a guest out today changes. Leaving before the booked departure shortens the stay
 * (the room is free from today, never earlier than the day after check-in) and keeps the booked
 * date in `plannedCheckOut`. `early` is the new check-out date, or null when nothing is shortened.
 */
export function checkOutPatch(
	booking: { checkIn: string; checkOut: string; plannedCheckOut?: string },
	today: string,
): { patch: BookingPatch; early: string | null } {
	const earliest = isoAddDays(booking.checkIn, 1);
	const end = today > earliest ? today : earliest;
	if (end >= booking.checkOut) return { patch: { status: 'checkedout' }, early: null };
	return { patch: { status: 'checkedout', checkOut: end, plannedCheckOut: booking.plannedCheckOut ?? booking.checkOut }, early: end };
}

/**
 * A hotel's bookings: `hotels/{hotelId}/bookings`. Only the hotel's owners can read or write
 * them (firestore.rules). Bookings are never deleted; cancelling sets `status: 'cancelled'`.
 */
@Service()
export class BookingsService {
	private readonly _firebase = inject(FirebaseService);

	/** Live list of all of a hotel's bookings. Returns an unsubscribe function. */
	listen(hotelId: string, onChange: (bookings: BookingRecord[]) => void, onError: (error: Error) => void = () => {}): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};
		return onSnapshot(
			collection(firestore, 'hotels', hotelId, 'bookings'),
			(snapshot) => onChange(snapshot.docs.map((d) => toBooking(d.id, d.data()))),
			onError,
		);
	}

	/** Creates a booking and returns its document id. */
	async add(hotelId: string, booking: BookingInput): Promise<string> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const { submissionId, guestId, ...fields } = booking;
		const ref = await addDoc(collection(firestore, 'hotels', hotelId, 'bookings'), {
			...fields,
			...(submissionId ? { submissionId } : {}),
			...(guestId ? { guestId } : {}),
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
		return ref.id;
	}

	async update(hotelId: string, bookingId: string, patch: BookingPatch): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		await updateDoc(doc(firestore, 'hotels', hotelId, 'bookings', bookingId), { ...patch, updatedAt: serverTimestamp() });
	}
}
