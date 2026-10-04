import { Service, inject } from '@angular/core';
import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	limit,
	onSnapshot,
	query,
	serverTimestamp,
	Timestamp,
	updateDoc,
	where,
	writeBatch,
	type DocumentData,
} from 'firebase/firestore';
import type { BookingRecord } from './bookings.service';
import { FirebaseService } from './firebase.service';

/** What a guest is created or edited with (`hotels/{hotelId}/guests/{guestId}`, see firestore.rules). */
export interface GuestInput {
	name: string;
	phone: string;
	email: string;
	notes: string;
	tags: string[];
}

export interface GuestRecord extends GuestInput {
	id: string;
	createdAt: Date | null;
}

/** Last 9 digits of a phone typed in any format; '' when there are fewer than 7 digits (not a usable key). */
export function phoneKey(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	return digits.length >= 7 ? digits.slice(-9) : '';
}

export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA');

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function toGuest(id: string, data: DocumentData): GuestRecord {
	return {
		id,
		name: str(data['name']),
		phone: str(data['phone']),
		email: str(data['email']),
		notes: str(data['notes']),
		tags: Array.isArray(data['tags']) ? data['tags'].filter((t): t is string => typeof t === 'string') : [],
		createdAt: (data['createdAt'] as Timestamp | undefined)?.toDate() ?? null,
	};
}

/** Firestore keys and timestamps for a guest's fields, ready to write. */
function fieldsOf(input: GuestInput) {
	const name = input.name.trim();
	const phone = input.phone.trim();
	return {
		name,
		nameKey: nameKey(name),
		phone,
		phoneKey: phoneKey(phone),
		email: input.email.trim(),
		notes: input.notes.trim(),
		tags: input.tags,
	};
}

/** Batches hold 500 writes; stay well below it. */
const BATCH_SIZE = 400;

/**
 * A hotel's guests: `hotels/{hotelId}/guests`. Only the hotel's owners can read or write them (firestore.rules).
 * Bookings point to a guest with `guestId` but keep their own copy of the name and contacts.
 */
@Service()
export class GuestsService {
	private readonly _firebase = inject(FirebaseService);

	/** Live guest list sorted by name. Returns an unsubscribe function. */
	listen(hotelId: string, onChange: (guests: GuestRecord[]) => void, onError: (error: Error) => void = () => {}): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};
		return onSnapshot(
			collection(firestore, 'hotels', hotelId, 'guests'),
			(snapshot) => onChange(snapshot.docs.map((d) => toGuest(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'uk'))),
			onError,
		);
	}

	/** Creates a guest and returns its id. */
	async add(hotelId: string, input: GuestInput): Promise<string> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const ref = doc(collection(firestore, 'hotels', hotelId, 'guests'));
		const batch = writeBatch(firestore);
		batch.set(ref, { ...fieldsOf(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
		await batch.commit();
		return ref.id;
	}

	async update(hotelId: string, guestId: string, input: GuestInput): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		await updateDoc(doc(firestore, 'hotels', hotelId, 'guests', guestId), { ...fieldsOf(input), updatedAt: serverTimestamp() });
	}

	async delete(hotelId: string, guestId: string): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		await deleteDoc(doc(firestore, 'hotels', hotelId, 'guests', guestId));
	}

	/**
	 * The id of the guest with this phone (or, without a phone, this exact name), creating one when there is
	 * none. Used when a booking is made so repeat guests collect under one profile. Two people booking the
	 * same new guest at the same moment can still create two; Guests → merge fixes that.
	 */
	async ensure(hotelId: string, input: Pick<GuestInput, 'name' | 'phone' | 'email'>): Promise<string> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const fields = fieldsOf({ ...input, notes: '', tags: [] });
		const guests = collection(firestore, 'hotels', hotelId, 'guests');
		const found = await getDocs(
			fields.phoneKey
				? query(guests, where('phoneKey', '==', fields.phoneKey), limit(1))
				: query(guests, where('phoneKey', '==', ''), where('nameKey', '==', fields.nameKey), limit(1)),
		);
		if (!found.empty) return found.docs[0].id;
		return this.add(hotelId, { ...input, notes: '', tags: [] });
	}

	/**
	 * Folds `drop` into `keep`: its bookings move to `keep`, missing contacts, tags and notes are carried
	 * over, and the duplicate profile is deleted. Booking history is untouched.
	 */
	async merge(hotelId: string, keep: GuestRecord, drop: GuestRecord, bookings: BookingRecord[]): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const moved = bookings.filter((b) => b.guestId === drop.id);
		const merged: GuestInput = {
			name: keep.name,
			phone: keep.phone || drop.phone,
			email: keep.email || drop.email,
			notes: [keep.notes, drop.notes].filter((n) => n && n.trim()).join('\n'),
			tags: [...new Set([...keep.tags, ...drop.tags])],
		};
		// Booking moves first, then the profile: if it stops half way, nothing is lost and the merge can be repeated.
		for (let i = 0; i < moved.length; i += BATCH_SIZE) {
			const batch = writeBatch(firestore);
			for (const b of moved.slice(i, i + BATCH_SIZE)) {
				batch.update(doc(firestore, 'hotels', hotelId, 'bookings', b.id), { guestId: keep.id, updatedAt: serverTimestamp() });
			}
			await batch.commit();
		}
		const batch = writeBatch(firestore);
		batch.update(doc(firestore, 'hotels', hotelId, 'guests', keep.id), { ...fieldsOf(merged), updatedAt: serverTimestamp() });
		batch.delete(doc(firestore, 'hotels', hotelId, 'guests', drop.id));
		await batch.commit();
	}

	/**
	 * Creates guests for bookings that have none (made before guests existed, or whose guest was deleted) and
	 * links them. Bookings are grouped by phone (or by name when they have no phone) and attached to the
	 * existing guest with the same key when there is one. Returns how many guests were created.
	 */
	async importFromBookings(hotelId: string, guests: GuestRecord[], bookings: BookingRecord[]): Promise<number> {
		const firestore = this._firebase.firestore;
		if (!firestore) throw new Error('Firestore is not available');
		const known = new Set(guests.map((g) => g.id));
		const groups = new Map<string, BookingRecord[]>();
		for (const b of bookings.filter((x) => !x.guestId || !known.has(x.guestId))) {
			const key = phoneKey(b.phone) ? 'p:' + phoneKey(b.phone) : 'n:' + nameKey(b.guestName);
			groups.set(key, [...(groups.get(key) ?? []), b]);
		}
		const byPhone = new Map(guests.filter((g) => phoneKey(g.phone)).map((g) => [phoneKey(g.phone), g.id]));
		const byName = new Map(guests.filter((g) => !phoneKey(g.phone)).map((g) => [nameKey(g.name), g.id]));

		const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
		let created = 0;
		for (const [key, list] of groups) {
			const latest = [...list].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
			let guestId = key.startsWith('p:') ? byPhone.get(key.slice(2)) : byName.get(key.slice(2));
			if (!guestId) {
				const ref = doc(collection(firestore, 'hotels', hotelId, 'guests'));
				guestId = ref.id;
				created++;
				const input: GuestInput = {
					name: latest[0].guestName,
					phone: latest.find((b) => b.phone)?.phone ?? '',
					email: latest.find((b) => b.email)?.email ?? '',
					notes: '',
					tags: [],
				};
				writes.push((batch) => batch.set(ref, { ...fieldsOf(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
			}
			for (const b of list) {
				const id = guestId;
				writes.push((batch) => batch.update(doc(firestore, 'hotels', hotelId, 'bookings', b.id), { guestId: id, updatedAt: serverTimestamp() }));
			}
		}
		// Guests are written before the bookings that point to them; a half-finished import is simply run again.
		for (let i = 0; i < writes.length; i += BATCH_SIZE) {
			const batch = writeBatch(firestore);
			for (const write of writes.slice(i, i + BATCH_SIZE)) write(batch);
			await batch.commit();
		}
		return created;
	}
}
