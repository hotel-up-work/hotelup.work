import type { BookingRecord } from '../../feature/firebase/bookings.service';
import { isoAddDays } from '../../feature/firebase/bookings.service';
import type { RoomRecord } from '../../feature/firebase/rooms.service';

/** Pure helpers behind the real-hotel Dashboard: what today's bookings and rooms say (CRM.md → `dashboard`). */

/** A guest who is due, in the house, or still holding the room. */
const holding = (b: BookingRecord) => b.status === 'pending' || b.status === 'confirmed' || b.status === 'checkedin';

export const balanceOf = (b: BookingRecord) => Math.max(0, b.total - b.paid);

/** Arriving today: waiting or already checked in. Cancelled and checked-out stays are not arrivals. */
export function arrivalsOn(bookings: BookingRecord[], day: string): BookingRecord[] {
	return bookings.filter((b) => b.checkIn === day && holding(b)).sort((a, b) => a.guestName.localeCompare(b.guestName, 'uk'));
}

/** Leaving today: still in the house, or already checked out (including early departures shortened to today). */
export function departuresOn(bookings: BookingRecord[], day: string): BookingRecord[] {
	return bookings
		.filter((b) => b.checkOut === day && (b.status === 'checkedin' || b.status === 'checkedout'))
		.sort((a, b) => a.guestName.localeCompare(b.guestName, 'uk'));
}

/** Guests still checked in although their check-out day has passed. */
export const overstays = (bookings: BookingRecord[], day: string) => bookings.filter((b) => b.status === 'checkedin' && b.checkOut < day);

/** Waiting bookings whose arrival day has passed without a check-in. */
export const lateArrivals = (bookings: BookingRecord[], day: string) =>
	bookings.filter((b) => (b.status === 'pending' || b.status === 'confirmed') && b.checkIn < day && b.checkOut > day);

/** Rooms with a guest in the house. */
export const occupiedRoomIds = (bookings: BookingRecord[]) => new Set(bookings.filter((b) => b.status === 'checkedin').map((b) => b.roomId));

/** Share of rooms with a stay (not cancelled) covering the night of `day`, in percent. */
export function occupancyOn(bookings: BookingRecord[], rooms: RoomRecord[], day: string): number {
	if (!rooms.length) return 0;
	const ids = new Set(rooms.map((r) => r.id));
	const busy = new Set(
		bookings.filter((b) => b.status !== 'cancelled' && ids.has(b.roomId) && b.checkIn <= day && b.checkOut > day).map((b) => b.roomId),
	);
	return Math.round((busy.size / rooms.length) * 100);
}

export function weekFrom(day: string, length = 7): { date: string; day: number; label: string }[] {
	return Array.from({ length }, (_, i) => {
		const date = isoAddDays(day, i);
		return { date, day: Number(date.slice(-2)), label: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(date + 'T00:00:00Z').getUTCDay()] };
	});
}

/** Booking sources of the bookings created in `month` (`YYYY-MM`), biggest first, as shares that sum to ~100. */
export function sourceShares(bookings: BookingRecord[], month: string): { name: string; count: number; value: number }[] {
	const counts = new Map<string, number>();
	let total = 0;
	for (const b of bookings) {
		if (b.status === 'cancelled' || !b.createdAt) continue;
		const created = new Date(b.createdAt.getTime() - b.createdAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 7);
		if (created !== month) continue;
		const name = b.source || 'Не вказано';
		counts.set(name, (counts.get(name) ?? 0) + 1);
		total++;
	}
	return [...counts]
		.map(([name, count]) => ({ name, count, value: Math.round((count / total) * 100) }))
		.sort((a, b) => b.count - a.count);
}
