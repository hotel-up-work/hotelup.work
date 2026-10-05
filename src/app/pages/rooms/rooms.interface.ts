import type { RoomBlock, RoomStatus, RoomTypeRecord } from '../../feature/firebase/rooms.service';

export interface MaintenanceNote {
	date: string;
	text: string;
	status: string;
}

export interface Room {
	/** Firestore document id; the room number in the demo. */
	id: string;
	number: string;
	type: string;
	floor: number;
	capacity: number;
	beds: string;
	area: number | null;
	price: number;
	extraGuests: number;
	extraGuestPrice: number;
	amenities: string[];
	status: RoomStatus;
	guest: string | null;
	maintenanceNotes: MaintenanceNote[];
	needsCleaning?: boolean;
	checkin?: string;
	checkout?: string;
	nights?: number;
	payment?: string;
	nextGuest?: string | null;
	nextStart?: string;
	nextEnd?: string;
	nextArrival?: string | null;
	lastCleaned?: string;
	cleanedBy?: string;
	checkoutTime?: string;
	assigned?: string | null;
	startedAt?: string;
	reason?: string;
	/** ISO `YYYY-MM-DD`. */
	blockStart?: string;
	blockEnd?: string;
	blockNote?: string;
}

export type RoomType = RoomTypeRecord;

export interface RoomTypeSummary extends RoomType {
	count: number;
	minPrice: number;
}

/** Values the add/edit room modal hands back to the page. */
export interface RoomFormValue {
	number: string;
	type: string;
	floor: number;
	capacity: number;
	price: number;
	extraGuests: number;
	extraGuestPrice: number;
	area: number;
}

export interface RoomTypeFormValue {
	name: string;
	description: string;
	capacity: number;
	price: number;
	extraGuests: number;
	extraGuestPrice: number;
}

export type { RoomBlock, RoomStatus };

/**
 * A modal save handler: resolves to an error message to show in the form,
 * or null when saved (the modal then closes itself).
 */
export type ModalSave<T> = (value: T) => Promise<string | null>;
