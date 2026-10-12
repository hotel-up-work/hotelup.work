import { Service, inject } from '@angular/core';
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	serverTimestamp,
	Timestamp,
	updateDoc,
	type DocumentData,
	type FieldValue,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

/** `light-cleaning`: a stay-over tidy while the guest stays several days; `needs-cleaning`: full clean after a check-out. */
export type RoomStatus = 'ready' | 'occupied' | 'light-cleaning' | 'needs-cleaning' | 'cleaning' | 'unavailable';

export interface RoomBlock {
	reason: string;
	/** ISO `YYYY-MM-DD`. */
	start: string;
	end: string;
	note: string;
}

/** Fields a room is created/edited with (`hotels/{hotelId}/rooms/{roomId}`, see firestore.rules). */
export interface RoomInput {
	number: string;
	/** Room type name, matches `roomTypes.name`. */
	type: string;
	floor: number;
	capacity: number;
	beds: string;
	area: number | null;
	price: number;
	/** Most people allowed beyond `capacity`. */
	extraGuests: number;
	/** Cost of each extra person per night. */
	extraGuestPrice: number;
	amenities: string[];
	/** Where the room is, for guests choosing a room: building or wing (`Корпус 2`), bathroom, balcony and view. Empty = not set. */
	building?: string;
	bathroom?: string;
	balcony?: string;
	view?: string;
}

/** Choices offered in the room form; `view` also takes free text. */
export const BATHROOM_OPTIONS = ['Душ', 'Ванна', 'Душ і ванна'];
export const BALCONY_OPTIONS = ['Балкон', 'Тераса', 'Французький балкон', 'Без балкона'];
export const VIEW_OPTIONS = ['Місто', 'Двір', 'Парк', 'Фортеця', 'Річка', 'Гори'];

export interface RoomRecord extends RoomInput {
	id: string;
	status: RoomStatus;
	block: RoomBlock | null;
	lastCleanedAt: Date | null;
}

/** Defaults new rooms of this type start with (`hotels/{hotelId}/roomTypes/{typeId}`). */
export interface RoomTypeInput {
	name: string;
	description: string;
	capacity: number;
	beds: string;
	area: number | null;
	price: number;
	/** Most people allowed beyond `capacity`. */
	extraGuests: number;
	/** Cost of each extra person per night. */
	extraGuestPrice: number;
	amenities: string[];
}

export interface RoomTypeRecord extends RoomTypeInput {
	id: string;
}

export interface RoomPatch {
	type?: string;
	floor?: number;
	capacity?: number;
	beds?: string;
	area?: number | null;
	price?: number;
	extraGuests?: number;
	extraGuestPrice?: number;
	amenities?: string[];
	building?: string;
	bathroom?: string;
	balcony?: string;
	view?: string;
	status?: RoomStatus;
	block?: RoomBlock | null;
	/** `true` stamps the server time (cleaning finished). */
	cleaned?: true;
}

const ROOM_STATUSES: RoomStatus[] = ['ready', 'occupied', 'light-cleaning', 'needs-cleaning', 'cleaning', 'unavailable'];

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

function toRoom(id: string, data: DocumentData): RoomRecord {
	const block = data['block'];
	const cleaned = data['lastCleanedAt'] as Timestamp | null | undefined;
	return {
		id,
		number: str(data['number']),
		type: str(data['type']),
		floor: num(data['floor'], 0),
		capacity: num(data['capacity'], 1),
		beds: str(data['beds']),
		area: typeof data['area'] === 'number' ? data['area'] : null,
		price: num(data['price'], 0),
		extraGuests: num(data['extraGuests'], 0),
		extraGuestPrice: num(data['extraGuestPrice'], 0),
		amenities: strings(data['amenities']),
		building: str(data['building']),
		bathroom: str(data['bathroom']),
		balcony: str(data['balcony']),
		view: str(data['view']),
		status: ROOM_STATUSES.includes(data['status']) ? data['status'] : 'ready',
		block: block && typeof block === 'object' ? { reason: str(block.reason), start: str(block.start), end: str(block.end), note: str(block.note) } : null,
		lastCleanedAt: cleaned?.toDate() ?? null,
	};
}

function toRoomType(id: string, data: DocumentData): RoomTypeRecord {
	return {
		id,
		name: str(data['name']),
		description: str(data['description']),
		capacity: num(data['capacity'], 1),
		beds: str(data['beds']),
		area: typeof data['area'] === 'number' ? data['area'] : null,
		price: num(data['price'], 0),
		extraGuests: num(data['extraGuests'], 0),
		extraGuestPrice: num(data['extraGuestPrice'], 0),
		amenities: strings(data['amenities']),
	};
}

/**
 * A hotel's room inventory: `hotels/{hotelId}/rooms` and `hotels/{hotelId}/roomTypes`.
 * Only the hotel's owners can read or write them (firestore.rules). Occupancy will come from
 * bookings once they exist; until then `status` is set by hand on the Rooms page.
 */
@Service()
export class RoomsService {
	private readonly _firebase = inject(FirebaseService);

	/** Live room list sorted by number. Returns an unsubscribe function. */
	listenRooms(hotelId: string, onChange: (rooms: RoomRecord[]) => void, onError: (error: Error) => void = () => {}): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};
		return onSnapshot(
			collection(firestore, 'hotels', hotelId, 'rooms'),
			(snapshot) =>
				onChange(
					snapshot.docs
						.map((d) => toRoom(d.id, d.data()))
						.sort((a, b) => a.number.localeCompare(b.number, 'uk', { numeric: true })),
				),
			onError,
		);
	}

	/** Live room type list sorted by name. Returns an unsubscribe function. */
	listenTypes(hotelId: string, onChange: (types: RoomTypeRecord[]) => void, onError: (error: Error) => void = () => {}): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};
		return onSnapshot(
			collection(firestore, 'hotels', hotelId, 'roomTypes'),
			(snapshot) => onChange(snapshot.docs.map((d) => toRoomType(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'uk'))),
			onError,
		);
	}

	async addRoom(hotelId: string, room: RoomInput): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;
		await addDoc(collection(firestore, 'hotels', hotelId, 'rooms'), {
			...room,
			status: 'ready' satisfies RoomStatus,
			block: null,
			lastCleanedAt: null,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
	}

	async updateRoom(hotelId: string, roomId: string, patch: RoomPatch): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;
		const { cleaned, ...fields } = patch;
		const data: Record<string, unknown | FieldValue> = { ...fields, updatedAt: serverTimestamp() };
		if (cleaned) data['lastCleanedAt'] = serverTimestamp();
		await updateDoc(doc(firestore, 'hotels', hotelId, 'rooms', roomId), data);
	}

	async deleteRoom(hotelId: string, roomId: string): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;
		await deleteDoc(doc(firestore, 'hotels', hotelId, 'rooms', roomId));
	}

	async addType(hotelId: string, type: RoomTypeInput): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;
		await addDoc(collection(firestore, 'hotels', hotelId, 'roomTypes'), { ...type, createdAt: serverTimestamp() });
	}
}
