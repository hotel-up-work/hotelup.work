import type { BookingRecord } from '../feature/firebase/bookings.service';
import type { RoomRecord } from '../feature/firebase/rooms.service';

/**
 * Whether `room` can host a stay from `start` to `end` (both `YYYY-MM-DD`; the guest leaves on `end`).
 * Another active booking overlaps when it starts before this stay ends and ends after it starts; a
 * cancelled booking never blocks. A room block's last day is inclusive.
 */
export function roomIsFree(room: RoomRecord, bookings: BookingRecord[], start: string, end: string): boolean {
	if (room.block && start <= room.block.end && end > room.block.start) return false;
	return !bookings.some((b) => b.roomId === room.id && b.status !== 'cancelled' && start < b.checkOut && end > b.checkIn);
}

export function nightsBetween(start: string, end: string): number {
	return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000);
}

/** Digits only, for matching a phone typed in any format. */
export const phoneDigits = (value: string) => value.replace(/\D/g, '');
