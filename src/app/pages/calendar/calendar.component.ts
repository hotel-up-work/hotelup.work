import { Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingInput, BookingPatch, BookingRecord, BookingsService, BookingStatus } from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { RoomRecord, RoomsService } from '../../feature/firebase/rooms.service';
import { SubmissionRecord, SubmissionsService } from '../../feature/firebase/submissions.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { limitRoomsToPlan } from '../../shared/plan';
import { canCurrent, isLiveSession } from '../../shared/role';

interface Room {
	/** Firestore document id (the room number in the demo). */
	id: string;
	number: string;
	type: string;
	cap: string;
	capacity: number;
	price: number;
}

type Status = BookingStatus;

interface Booking {
	id: string;
	/** Room number shown in the grid; follows the room when it is renumbered. */
	room: string;
	roomId: string;
	name: string;
	phone: string;
	email: string;
	start: string;
	end: string;
	guests: number;
	total: number;
	paid: number;
	status: Status;
	source: string;
	notes: string;
	lateCheckoutHour?: number;
	submissionId?: string;
}

interface Blocked {
	room: string;
	/** Exclusive end, like a booking's check-out. */
	start: string;
	end: string;
	reason: string;
}

type DialogView =
	| { kind: 'quick-booking' }
	| { kind: 'conflict'; room: string; start: string; end: string; type: string; moveId?: string }
	| { kind: 'confirm-move' }
	| { kind: 'message'; bookingId: string }
	| { kind: 'payment'; bookingId: string }
	| { kind: 'extend-stay'; bookingId: string }
	| { kind: 'cancel'; bookingId: string }
	| null;

interface BookingForm {
	name: string;
	phone: string;
	email: string;
	/** Room number. */
	room: string;
	guests: number;
	start: string;
	end: string;
	/** null = nights × room price. */
	total: number | null;
	source: string;
	payment: 'none' | 'half' | 'full';
	status: 'confirmed' | 'pending';
	notes: string;
	/** Website request this booking is created from. */
	submission: { id: string; label: string; message: string; roomType: string } | null;
}

const DEMO_TODAY = '2026-09-17';
const CHECKIN_HOUR = 14;
const CHECKOUT_HOUR = 11;
const LATE_CHECKOUT_OPTIONS = [12, 14, 16, 18];
const MS = 86400000;

const DEMO_ROOMS: { number: string; type: string; cap: string }[] = [
	{ number: '101', type: 'Стандарт', cap: '2 гості' },
	{ number: '102', type: 'Стандарт', cap: '2 гості' },
	{ number: '103', type: 'Стандарт', cap: '2 гості' },
	{ number: '104', type: 'Стандарт', cap: '2 гості' },
	{ number: '105', type: 'Стандарт', cap: '2 гості' },
	{ number: '106', type: 'Покращений', cap: '2–3 гості' },
	{ number: '107', type: 'Покращений', cap: '2–3 гості' },
	{ number: '108', type: 'Покращений', cap: '2–3 гості' },
	{ number: '201', type: 'Люкс', cap: '2–3 гості' },
	{ number: '202', type: 'Люкс', cap: '2–3 гості' },
	{ number: '203', type: 'Люкс', cap: '2–3 гості' },
	{ number: '204', type: 'Люкс', cap: '2–3 гості' },
	{ number: '205', type: 'Люкс', cap: '2–3 гості' },
	{ number: '301', type: 'Апартаменти', cap: '4 гості' },
	{ number: '302', type: 'Апартаменти', cap: '4 гості' },
];
const BASE_PRICE: Record<string, number> = { Стандарт: 1600, Покращений: 2000, Люкс: 2400, Апартаменти: 3200 };
const SOURCES = ['Пряме бронювання', 'Сайт', 'Instagram', 'Google', 'Телефон', 'Booking.com', 'Walk-in', 'Інше'];

const SEED_BOOKINGS: Omit<Booking, 'roomId'>[] = [
	{ id: '2001', room: '204', name: 'Анна Коваленко', phone: '+380 67 123 45 67', email: 'anna@example.com', start: '2026-09-17', end: '2026-09-20', guests: 2, total: 4800, paid: 4800, status: 'confirmed', source: 'Instagram', notes: 'Потрібен тихий номер. Очікуваний час прибуття: 13:30.' },
	{ id: '2002', room: '103', name: 'Олег Бондар', phone: '+380 50 222 11 33', email: '', start: '2026-09-17', end: '2026-09-18', guests: 1, total: 2400, paid: 1200, status: 'checkedin', source: 'Телефон', notes: '' },
	{ id: '2003', room: '202', name: 'Марія Петренко', phone: '+380 63 456 78 90', email: '', start: '2026-09-17', end: '2026-09-21', guests: 2, total: 9600, paid: 9600, status: 'confirmed', source: 'Booking.com', notes: '' },
	{ id: '2004', room: '205', name: 'Ірина Шевченко', phone: '+380 97 654 32 10', email: '', start: '2026-09-18', end: '2026-09-20', guests: 2, total: 4800, paid: 0, status: 'pending', source: 'Пряме бронювання', notes: 'Заїзд орієнтовно ввечері.' },
	{ id: '2005', room: '106', name: 'Дмитро Левченко', phone: '+380 66 111 22 33', email: '', start: '2026-09-19', end: '2026-09-23', guests: 2, total: 8000, paid: 4000, status: 'confirmed', source: 'Google', notes: '' },
	{ id: '2006', room: '101', name: 'Олена Романюк', phone: '+380 68 222 33 44', email: '', start: '2026-09-20', end: '2026-09-22', guests: 1, total: 3200, paid: 3200, status: 'confirmed', source: 'Сайт', notes: '' },
	{ id: '2007', room: '302', name: 'Максим Ткаченко', phone: '+380 63 333 44 55', email: '', start: '2026-09-21', end: '2026-09-24', guests: 4, total: 9600, paid: 4800, status: 'pending', source: 'Booking.com', notes: '' },
	{ id: '2008', room: '107', name: 'Андрій Мельник', phone: '+380 50 444 55 66', email: '', start: '2026-09-22', end: '2026-09-24', guests: 2, total: 4000, paid: 4000, status: 'confirmed', source: 'Пряме бронювання', notes: '' },
	{ id: '2009', room: '203', name: 'Наталія Коваль', phone: '+380 97 555 66 77', email: '', start: '2026-09-23', end: '2026-09-27', guests: 3, total: 9600, paid: 9600, status: 'confirmed', source: 'Google', notes: '' },
	{ id: '2010', room: '104', name: 'Тарас Гончар', phone: '+380 66 777 88 99', email: '', start: '2026-09-18', end: '2026-09-19', guests: 2, total: 1600, paid: 0, status: 'cancelled', source: 'Instagram', notes: 'Скасовано гостем.' },
	{ id: '2011', room: '201', name: 'Юлія Савчук', phone: '+380 68 888 99 00', email: '', start: '2026-09-24', end: '2026-09-27', guests: 2, total: 7200, paid: 7200, status: 'confirmed', source: 'Walk-in', notes: '' },
	{ id: '2012', room: '102', name: 'Віктор Коваль', phone: '+380 63 999 00 11', email: '', start: '2026-09-25', end: '2026-09-28', guests: 2, total: 4800, paid: 2400, status: 'pending', source: 'Телефон', notes: '' },
];
const DEMO_BLOCKED: Blocked[] = [{ room: '301', start: '2026-09-25', end: '2026-09-28', reason: 'Ремонт' }];

const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const addDays = (s: string, n: number) => {
	const d = toDate(s);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
const shortDate = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toDate(s));
const weekdayShort = (s: string) => ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][toDate(s).getUTCDay()];
const monthLabel = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toDate(s));
const isWeekend = (s: string) => [0, 6].includes(toDate(s).getUTCDay());
const dayNum = (s: string) => Number(s.slice(-2));
const initials = (n: string) =>
	n
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('');
const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const statusLabel = (s: Status) =>
	({ confirmed: 'Підтверджено', pending: 'Очікує підтвердження', checkedin: 'Заїхав', cancelled: 'Скасовано' })[s];
const paymentLabel = (b: Booking) => (b.paid <= 0 ? 'Не оплачено' : b.paid < b.total ? 'Частково оплачено' : 'Оплачено');
/** `YYYY-MM-DD` in the browser's time zone. */
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Ukrainian plural: 1 ніч, 2 ночі, 5 ночей. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
const nightsLabel = (n: number) => `${n} ${plural(n, 'ніч', 'ночі', 'ночей')}`;
const guestsLabel = (n: number) => `${n} ${plural(n, 'гість', 'гості', 'гостей')}`;

function demoRooms(): Room[] {
	return DEMO_ROOMS.map((r) => ({
		id: r.number,
		number: r.number,
		type: r.type,
		cap: r.cap,
		capacity: Number(r.cap.match(/(\d)(?!.*\d)/)?.[1] ?? 2),
		price: BASE_PRICE[r.type],
	}));
}

function toRoom(r: RoomRecord): Room {
	return { id: r.id, number: r.number, type: r.type, cap: guestsLabel(r.capacity), capacity: r.capacity, price: r.price };
}

function toBooking(r: BookingRecord): Booking {
	return {
		id: r.id,
		room: r.roomNumber,
		roomId: r.roomId,
		name: r.guestName,
		phone: r.phone,
		email: r.email,
		start: r.checkIn,
		end: r.checkOut,
		guests: r.guests,
		total: r.total,
		paid: r.paid,
		status: r.status,
		source: r.source,
		notes: r.notes,
		lateCheckoutHour: r.lateCheckoutHour ?? undefined,
		submissionId: r.submissionId,
	};
}

@Component({
	selector: 'app-calendar',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './calendar.component.html',
	styleUrl: './calendar.component.scss',
})
export class CalendarComponent {
	private readonly _roomsService = inject(RoomsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _submissionsService = inject(SubmissionsService);
	private readonly _hotel = inject(HotelService);
	private readonly _route = inject(ActivatedRoute);
	private readonly _router = inject(Router);

	/** Real account: rooms and bookings of the active hotel from Firestore. Demo: the seed data below. */
	protected readonly live = isLiveSession();
	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return "Grand Hotel · Кам'янець-Подільський";
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly showFinance = canCurrent('guestBill');
	/** Move, confirm, check in, extend and cancel bookings. Sales only creates holds (CRM.md). */
	protected readonly canChange = canCurrent('changeBooking');
	protected readonly canCollect = canCurrent('collectPayment') && this.showFinance;

	protected readonly TODAY = this.live ? localDate(new Date()) : DEMO_TODAY;
	protected readonly SOURCES = SOURCES;
	protected readonly LATE_CHECKOUT_OPTIONS = LATE_CHECKOUT_OPTIONS;
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly weekdayShort = weekdayShort;
	protected readonly isWeekend = isWeekend;
	protected readonly dayNum = dayNum;
	protected readonly dayDiff = dayDiff;
	protected readonly initials = initials;
	protected readonly statusLabel = statusLabel;
	protected readonly paymentLabel = paymentLabel;
	protected readonly nightsLabel = nightsLabel;
	protected readonly guestsLabel = guestsLabel;

	protected readonly rooms = signal<Room[]>(this.live ? [] : limitRoomsToPlan(demoRooms()));
	private readonly _bookings = signal<Booking[]>(this.live ? [] : SEED_BOOKINGS.map((b) => ({ ...b, roomId: b.room })));
	private readonly _blocks = signal<Blocked[]>(this.live ? [] : DEMO_BLOCKED);
	private readonly _roomsLoaded = signal(!this.live);
	private readonly _bookingsLoaded = signal(!this.live);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());
	/** Writes are possible: always in the demo; for a real hotel once rooms and bookings have loaded. */
	protected readonly ready = computed(() => !this.live || (!!this.hotelId() && !this.loading() && !this.loadError()));

	/** Bookings with the room number resolved from the room, so a renumbered room stays in sync. */
	protected readonly bookings = computed(() => {
		const numbers = new Map(this.rooms().map((r) => [r.id, r.number]));
		return this._bookings().map((b) => {
			const number = numbers.get(b.roomId);
			return number && number !== b.room ? { ...b, room: number } : b;
		});
	});
	protected readonly blocked = this._blocks.asReadonly();

	protected readonly viewStart = signal(this.TODAY);
	protected readonly viewDays = signal(14);
	protected readonly search = signal('');
	protected readonly statusFilter = signal(new Set<Status>(['confirmed', 'pending', 'checkedin', 'cancelled']));
	protected readonly hiddenTypes = signal(new Set<string>());
	protected readonly filtersOpen = signal(false);
	protected readonly mobileDate = signal(this.TODAY);
	protected readonly mobileDays = signal(1);
	protected readonly selectedId = signal<string | null>(null);
	protected readonly pendingMove = signal<{ id: string; room: string; start: string; end: string } | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly bookingForm = signal<BookingForm>(this._emptyForm(this.TODAY));
	protected readonly formError = signal('');
	protected readonly saving = signal(false);
	protected readonly toastMessage = signal('');
	protected readonly hover = signal<{ booking: Booking; x: number; y: number } | null>(null);

	private _toastTimer?: ReturnType<typeof setTimeout>;
	private _dragId: string | null = null;
	/** Submission id already taken from the URL, so a re-run of the effect doesn't open it twice. */
	private _handledSubmission: string | null = null;
	private readonly _queryParams = toSignal(this._route.queryParamMap);

	/** Room types in the order their first room appears. */
	protected readonly groupOrder = computed(() => [...new Set(this.rooms().map((r) => r.type))]);
	protected readonly rangeLabel = computed(() => monthLabel(this.viewStart()));
	protected readonly dateRange = computed(() =>
		Array.from({ length: this.viewDays() }, (_, i) => addDays(this.viewStart(), i)),
	);
	protected readonly visibleRooms = computed(() => this.rooms().filter((r) => !this.hiddenTypes().has(r.type)));
	protected readonly visibleBookings = computed(() => this.bookings().filter((b) => this.statusFilter().has(b.status)));

	protected readonly gridRows = computed(() => {
		const rows: ({ kind: 'group'; label: string; row: number } | { kind: 'room'; room: Room; row: number })[] = [];
		let row = 2;
		for (const type of this.groupOrder()) {
			const list = this.visibleRooms().filter((r) => r.type === type);
			if (!list.length) continue;
			rows.push({ kind: 'group', label: type, row });
			row++;
			for (const r of list) {
				rows.push({ kind: 'room', room: r, row });
				row++;
			}
		}
		return rows;
	});

	protected readonly bookingBlocks = computed(() => {
		const dates = this.dateRange();
		const rowsByRoom = new Map(
			this.gridRows()
				.filter((r): r is { kind: 'room'; room: Room; row: number } => r.kind === 'room')
				.map((r) => [r.room.number, r.row]),
		);
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const blocks: {
			booking: Booking;
			row: number;
			colStart: number;
			colEnd: number;
			match: boolean;
			insetLeft: number;
			insetRight: number;
		}[] = [];
		for (const b of this.visibleBookings()) {
			const row = rowsByRoom.get(b.room);
			if (row === undefined) continue;
			const rawStart = dayDiff(this.viewStart(), b.start);
			const rawEnd = dayDiff(this.viewStart(), b.end);
			const s = Math.max(0, rawStart);
			const e = Math.min(dates.length, rawEnd);
			if (e <= 0 || s >= dates.length) continue;
			const match = !!q && (b.name + ' ' + b.phone + ' ' + b.room + ' #' + b.id).toLocaleLowerCase('uk-UA').includes(q);
			const showCheckinEdge = rawStart >= 0 && rawStart < dates.length;
			const showCheckoutEdge = rawEnd >= 0 && rawEnd < dates.length;
			const colStart = s + 2;
			const colEnd = showCheckoutEdge ? e + 3 : e + 2;
			const totalCols = colEnd - colStart;
			const checkoutHour = b.lateCheckoutHour ?? CHECKOUT_HOUR;
			const insetLeft = showCheckinEdge ? (CHECKIN_HOUR / 24 / totalCols) * 100 : 0;
			const insetRight = showCheckoutEdge ? ((24 - checkoutHour) / 24 / totalCols) * 100 : 0;
			blocks.push({ booking: b, row, colStart, colEnd, match, insetLeft, insetRight });
		}
		return blocks;
	});

	protected readonly blockedOverlays = computed(() => {
		const dates = this.dateRange();
		const rowsByRoom = new Map(
			this.gridRows()
				.filter((r): r is { kind: 'room'; room: Room; row: number } => r.kind === 'room')
				.map((r) => [r.room.number, r.row]),
		);
		return this.blocked()
			.map((bl) => {
				const row = rowsByRoom.get(bl.room);
				if (row === undefined) return null;
				const s = Math.max(0, dayDiff(this.viewStart(), bl.start));
				const e = Math.min(dates.length, dayDiff(this.viewStart(), bl.end));
				if (e <= 0 || s >= dates.length) return null;
				return { ...bl, row, colStart: s + 2, colEnd: e + 2 };
			})
			.filter((x): x is NonNullable<typeof x> => x !== null);
	});

	protected readonly mobileRoomCards = computed(() => {
		const dates = Array.from({ length: this.mobileDays() }, (_, i) => addDays(this.mobileDate(), i));
		return this.rooms().map((r) => {
			const booking = this.bookings().find(
				(x) => x.room === r.number && x.status !== 'cancelled' && dates.some((d) => d >= x.start && d < x.end),
			);
			const blocked = this.blocked().find((x) => x.room === r.number && dates.some((d) => d >= x.start && d < x.end));
			return { room: r, booking, blocked };
		});
	});

	protected readonly formRoom = computed(() => this.rooms().find((r) => r.number === this.bookingForm().room));
	protected readonly formNights = computed(() => {
		const { start, end } = this.bookingForm();
		return start && end ? Math.max(0, dayDiff(start, end)) : 0;
	});
	protected readonly formAutoTotal = computed(() => this.formNights() * (this.formRoom()?.price ?? 0));
	protected readonly formTotal = computed(() => this.bookingForm().total ?? this.formAutoTotal());

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	constructor() {
		effect(() => {
			const dialog = this.dialogRef()?.nativeElement;
			if (!dialog) return;
			if (this.dialogView() !== null) {
				if (!dialog.open) dialog.showModal();
			} else if (dialog.open) {
				dialog.close();
			}
		});

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!this.live || !hotelId) return;
			this.rooms.set([]);
			this._bookings.set([]);
			this._blocks.set([]);
			this._roomsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			this.selectedId.set(null);
			this.hiddenTypes.set(new Set());
			const onError = (error: Error) => {
				// Most often missing rules for hotels/{id}/bookings: deploy firestore.rules.
				console.error('Calendar listener failed', error);
				this.loadError.set('Не вдалося завантажити календар. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopRooms = this._roomsService.listenRooms(
				hotelId,
				(records) => {
					this.rooms.set(records.map(toRoom));
					this._blocks.set(
						records
							.filter((r) => r.block)
							// A room block's last day is inclusive; the calendar's ranges end on the departure day.
							.map((r) => ({ room: r.number, start: r.block!.start, end: addDays(r.block!.end, 1), reason: r.block!.reason })),
					);
					this._roomsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(records) => {
					this._bookings.set(records.map(toBooking));
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			onCleanup(() => {
				stopRooms();
				stopBookings();
			});
		});

		// "Create booking" on a submission lands here as /calendar?submission=<id>.
		effect(() => {
			const submissionId = this._queryParams()?.get('submission');
			const hotelId = this.hotelId();
			if (!submissionId || !hotelId || !this.live || !this.ready() || submissionId === this._handledSubmission) return;
			this._handledSubmission = submissionId;
			untracked(() => void this._startFromSubmission(hotelId, submissionId));
		});
	}

	protected booking(id: string): Booking | undefined {
		return this.bookings().find((b) => b.id === id);
	}

	protected roomOf(number: string): Room | undefined {
		return this.rooms().find((r) => r.number === number);
	}

	protected occupied(room: string, date: string): boolean {
		const nextDay = addDays(date, 1);
		if (this.blocked().some((bl) => bl.room === room && date < bl.end && nextDay > bl.start)) return true;
		return this.bookings().some(
			(b) => b.room === room && b.status !== 'cancelled' && date < b.end && nextDay > b.start,
		);
	}

	private bookingsOverlap(room: string, start: string, end: string, excludeId: string | null): boolean {
		if (this.blocked().some((bl) => bl.room === room && start < bl.end && end > bl.start)) return true;
		return this.bookings().some(
			(b) => b.room === room && b.id !== excludeId && b.status !== 'cancelled' && start < b.end && end > b.start,
		);
	}

	protected alternativesFor(type: string, start: string, end: string, excludeRoom: string, excludeId?: string): Room[] {
		return this.rooms().filter(
			(r) => r.type === type && r.number !== excludeRoom && !this.bookingsOverlap(r.number, start, end, excludeId ?? null),
		);
	}

	protected prevRange(): void {
		this.viewStart.set(addDays(this.viewStart(), -this.viewDays()));
	}

	protected nextRange(): void {
		this.viewStart.set(addDays(this.viewStart(), this.viewDays()));
	}

	protected goToday(): void {
		this.viewStart.set(this.TODAY);
		this.mobileDate.set(this.TODAY);
	}

	protected setViewDays(days: number): void {
		this.viewDays.set(days);
	}

	protected mobilePrev(): void {
		this.mobileDate.set(addDays(this.mobileDate(), -this.mobileDays()));
	}

	protected mobileNext(): void {
		this.mobileDate.set(addDays(this.mobileDate(), this.mobileDays()));
	}

	protected setMobileDays(days: number): void {
		this.mobileDays.set(days);
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleStatusFilter(status: Status, checked: boolean): void {
		this.statusFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(status) : next.delete(status);
			return next;
		});
	}

	protected toggleTypeFilter(type: string, checked: boolean): void {
		this.hiddenTypes.update((set) => {
			const next = new Set(set);
			checked ? next.delete(type) : next.add(type);
			return next;
		});
	}

	protected resetFilters(): void {
		this.statusFilter.set(new Set<Status>(['confirmed', 'pending', 'checkedin', 'cancelled']));
		this.hiddenTypes.set(new Set());
	}

	protected onDayCellClick(room: string, date: string): void {
		if (!this.ready() || this.occupied(room, date)) return;
		this.openQuickBooking(room, date);
	}

	private _emptyForm(start: string, room = ''): BookingForm {
		return {
			name: '',
			phone: '',
			email: '',
			room,
			guests: 2,
			start,
			end: addDays(start, 1),
			total: null,
			source: this.live ? 'Пряме бронювання' : SOURCES[0],
			payment: 'none',
			status: this.canChange ? 'confirmed' : 'pending',
			notes: '',
			submission: null,
		};
	}

	protected patchForm(patch: Partial<BookingForm>): void {
		this.bookingForm.update((f) => ({ ...f, ...patch }));
	}

	/** Moving the check-in keeps the stay's length; the check-out is moved with it. */
	protected setFormStart(start: string): void {
		const { start: oldStart, end } = this.bookingForm();
		const nights = oldStart && end ? dayDiff(oldStart, end) : 1;
		this.patchForm({ start, end: start ? addDays(start, Math.max(1, nights)) : end });
	}

	protected openQuickBooking(room: string | null, date: string): void {
		if (!this.ready()) return;
		this.formError.set('');
		this.bookingForm.set(this._emptyForm(date, room ?? this.rooms()[0]?.number ?? ''));
		this.dialogView.set({ kind: 'quick-booking' });
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	protected openSidePanel(id: string): void {
		this.selectedId.set(id);
	}

	protected closeSidePanel(): void {
		this.selectedId.set(null);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	/** " · Демо" suffix for toasts of actions that only change local demo data. */
	private get demoTag(): string {
		return this.live ? '' : ' · Демо';
	}

	protected showHover(event: MouseEvent, booking: Booking): void {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		this.hover.set({ booking, x: Math.min(window.innerWidth - 236, rect.left), y: rect.bottom + 8 + window.scrollY });
	}

	protected hideHover(): void {
		this.hover.set(null);
	}

	protected onDragStart(event: DragEvent, id: string): void {
		if (!this.canChange) return event.preventDefault();
		this._dragId = id;
		event.dataTransfer?.setData('text/plain', id);
	}

	protected onDragOver(event: DragEvent): void {
		event.preventDefault();
	}

	protected onDrop(event: DragEvent, room: string, date: string): void {
		event.preventDefault();
		const id = this._dragId;
		this._dragId = null;
		if (id == null || !this.canChange) return;
		const b = this.booking(id);
		if (!b) return;
		const nights = dayDiff(b.start, b.end);
		const newStart = date;
		const newEnd = addDays(newStart, nights);
		if (room === b.room && newStart === b.start) return;
		if (this.bookingsOverlap(room, newStart, newEnd, b.id)) {
			this.dialogView.set({ kind: 'conflict', room, start: newStart, end: newEnd, type: this.roomOf(room)!.type, moveId: b.id });
			return;
		}
		this.pendingMove.set({ id: b.id, room, start: newStart, end: newEnd });
		this.dialogView.set({ kind: 'confirm-move' });
	}

	protected async applyPendingMove(): Promise<void> {
		const m = this.pendingMove();
		const room = m && this.roomOf(m.room);
		if (!m || !room || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(
			m.id,
			{ roomId: room.id, roomNumber: room.number, checkIn: m.start, checkOut: m.end },
			{ room: room.number, roomId: room.id, start: m.start, end: m.end },
		);
		this.saving.set(false);
		if (!saved) return;
		this.pendingMove.set(null);
		this.closeDialog();
		this.toast('Бронювання переміщено' + this.demoTag);
	}

	/** Conflict dialog: a booking being moved goes to the free room; a new booking returns to the form with it. */
	protected pickAlternative(room: string, view: { start: string; end: string; moveId?: string }): void {
		if (view.moveId) {
			this.pendingMove.set({ id: view.moveId, room, start: view.start, end: view.end });
			this.dialogView.set({ kind: 'confirm-move' });
			return;
		}
		this.patchForm({ room, total: null });
		this.formError.set('');
		this.dialogView.set({ kind: 'quick-booking' });
	}

	/** Free room closest to what a website request asked for: its type first, then any room that fits. */
	private _suggestRoom(type: string, start: string, end: string, guests: number): string {
		const rooms = this.rooms();
		const free = (r: Room) => !this.bookingsOverlap(r.number, start, end, null);
		const fits = (r: Room) => r.capacity >= guests;
		const sameType = rooms.filter((r) => r.type === type);
		return (
			(sameType.find((r) => free(r) && fits(r)) ?? sameType.find(free) ?? rooms.find((r) => free(r) && fits(r)) ?? rooms.find(free) ?? rooms[0])
				?.number ?? ''
		);
	}

	private async _startFromSubmission(hotelId: string, submissionId: string): Promise<void> {
		// Drop the id from the URL so a reload doesn't open the form again.
		this._router.navigate([], { queryParams: { submission: null }, queryParamsHandling: 'merge', replaceUrl: true });
		let submission: SubmissionRecord | null = null;
		try {
			submission = await this._submissionsService.get(hotelId, submissionId);
		} catch (error) {
			console.error('Submission load failed', error);
		}
		if (!submission) {
			this.toast('Не вдалося відкрити заявку. Створіть бронювання вручну.');
			return;
		}
		if (!this.rooms().length) {
			this.toast('Спершу додайте номери на сторінці «Номери».');
			return;
		}
		const start = submission.checkIn || this.TODAY;
		const end = submission.checkOut && submission.checkOut > start ? submission.checkOut : addDays(start, 1);
		const guests = Math.max(1, submission.guests ?? 1);
		this.formError.set('');
		this.bookingForm.set({
			...this._emptyForm(start),
			name: submission.name,
			phone: submission.phone,
			email: submission.email,
			room: this._suggestRoom(submission.roomType, start, end, guests),
			guests,
			start,
			end,
			source: 'Сайт',
			notes: submission.message,
			submission: {
				id: submission.id,
				label: submission.name || submission.phone,
				message: submission.message,
				roomType: submission.roomType,
			},
		});
		this.viewStart.set(start);
		this.mobileDate.set(start);
		this.dialogView.set({ kind: 'quick-booking' });
	}

	protected async submitBooking(): Promise<void> {
		if (this.saving()) return;
		const f = this.bookingForm();
		const name = f.name.trim();
		const phone = f.phone.trim();
		const room = this.roomOf(f.room);
		const guests = Number(f.guests);
		if (!name && !phone) return this.formError.set('Вкажіть ім’я або телефон гостя.');
		if (!room) return this.formError.set('Оберіть номер.');
		if (!f.start || !f.end || f.end <= f.start) return this.formError.set('Виїзд має бути після заїзду.');
		if (!Number.isInteger(guests) || guests < 1) return this.formError.set('Вкажіть кількість гостей.');
		if (this.live && guests > room.capacity) {
			return this.formError.set(`У номері ${room.number} може жити не більше ${guestsLabel(room.capacity)}.`);
		}
		if (this.bookingsOverlap(room.number, f.start, f.end, null)) {
			this.dialogView.set({ kind: 'conflict', room: room.number, start: f.start, end: f.end, type: room.type });
			return;
		}

		const total = Math.max(0, Math.round(this.formTotal()));
		const paid = !this.canCollect ? 0 : f.payment === 'full' ? total : f.payment === 'half' ? Math.round(total / 2) : 0;
		const input: BookingInput = {
			roomId: room.id,
			roomNumber: room.number,
			guestName: name || phone,
			phone,
			email: f.email.trim(),
			checkIn: f.start,
			checkOut: f.end,
			guests,
			total,
			paid,
			// Only roles that may change bookings confirm one; Sales creates a hold.
			status: this.canChange ? f.status : 'pending',
			source: f.source,
			notes: f.notes.trim(),
			...(f.submission ? { submissionId: f.submission.id } : {}),
		};

		this.formError.set('');
		const hotelId = this.hotelId();
		if (this.live && hotelId) {
			this.saving.set(true);
			let id: string;
			try {
				id = await this._bookingsService.add(hotelId, input);
			} catch (error) {
				console.error('Booking create failed', error);
				this.saving.set(false);
				return this.formError.set('Не вдалося створити бронювання. Перевірте зʼєднання та спробуйте ще раз.');
			}
			let submissionSaved = true;
			if (f.submission) {
				try {
					await this._submissionsService.updateStatus(f.submission.id, 'booked', `Створено бронювання · номер ${room.number}`);
				} catch (error) {
					console.error('Submission status update failed', error);
					submissionSaved = false;
				}
			}
			this.saving.set(false);
			this._afterCreate(input.checkIn, id);
			this.toast(
				submissionSaved ? `Бронювання створено · номер ${room.number}` : 'Бронювання створено, але статус заявки не змінено. Змініть його вручну в Заявках.',
			);
			return;
		}

		const id = String(Math.max(0, ...this._bookings().map((b) => Number(b.id) || 0)) + 1);
		this._bookings.update((bs) => [
			...bs,
			{
				id,
				room: input.roomNumber,
				roomId: input.roomId,
				name: input.guestName,
				phone: input.phone,
				email: input.email,
				start: input.checkIn,
				end: input.checkOut,
				guests: input.guests,
				total: input.total,
				paid: input.paid,
				status: input.status,
				source: input.source,
				notes: input.notes,
			},
		]);
		this._afterCreate(input.checkIn, id);
		this.toast('Бронювання створено · #' + id);
	}

	private _afterCreate(start: string, id: string): void {
		this.closeDialog();
		// Show the new stay: jump to it when it starts outside the visible range.
		const first = this.viewStart();
		if (start < first || start >= addDays(first, this.viewDays())) this.viewStart.set(start);
		this.selectedId.set(id);
	}

	/** Saves a change: to Firestore for a real hotel, to the local seed list in the demo. */
	private async _save(id: string, patch: BookingPatch, local: Partial<Booking>): Promise<boolean> {
		const hotelId = this.hotelId();
		if (this.live && hotelId) {
			try {
				await this._bookingsService.update(hotelId, id, patch);
				return true;
			} catch (error) {
				console.error('Booking update failed', error);
				this.toast('Не вдалося зберегти зміни. Перевірте зʼєднання та спробуйте ще раз.');
				return false;
			}
		}
		this._bookings.update((bs) => bs.map((b) => (b.id === id ? { ...b, ...local } : b)));
		return true;
	}

	protected async submitPayment(id: string, amount: number): Promise<void> {
		const b = this.booking(id);
		if (!b || !this.canCollect || !(amount > 0) || amount > b.total - b.paid || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { paid: b.paid + amount }, { paid: b.paid + amount });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.openSidePanel(id);
		this.toast('Оплату додано · ' + money(amount));
	}

	protected submitMessage(): void {
		this.closeDialog();
		this.toast('Чернетку повідомлення підготовлено · Демо');
	}

	protected askCancel(id: string): void {
		if (this.canChange) this.dialogView.set({ kind: 'cancel', bookingId: id });
	}

	protected async cancelBooking(id: string): Promise<void> {
		if (!this.canChange || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { status: 'cancelled' }, { status: 'cancelled' });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.closeSidePanel();
		this.toast('Бронювання скасовано' + this.demoTag);
	}

	protected async setStatus(id: string, status: Status): Promise<void> {
		if (!this.canChange || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { status }, { status });
		this.saving.set(false);
		if (saved) this.toast(status === 'checkedin' ? 'Заїзд відмічено' : 'Бронювання підтверджено');
	}

	protected requestRoomChange(): void {
		this.toast('Оберіть новий номер перетягнувши бронювання в календарі' + this.demoTag);
	}

	protected checkoutHourOf(b: Booking): number {
		return b.lateCheckoutHour ?? CHECKOUT_HOUR;
	}

	protected checkoutLabel(b: Booking): string {
		const hour = this.checkoutHourOf(b);
		return `${String(hour).padStart(2, '0')}:00`;
	}

	protected canExtendStay(b: Booking): boolean {
		if (!this.canChange || b.status === 'cancelled') return false;
		const roomTakenAfter = this.bookings().some(
			(x) => x.id !== b.id && x.room === b.room && x.status !== 'cancelled' && x.start === b.end,
		);
		const blockedAfter = this.blocked().some((bl) => bl.room === b.room && bl.start === b.end);
		return !roomTakenAfter && !blockedAfter;
	}

	protected openExtendStay(id: string): void {
		this.dialogView.set({ kind: 'extend-stay', bookingId: id });
	}

	protected async submitExtendStay(id: string, hour: number): Promise<void> {
		if (!this.canChange || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { lateCheckoutHour: hour }, { lateCheckoutHour: hour });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.openSidePanel(id);
		this.toast(`Пізній виїзд до ${String(hour).padStart(2, '0')}:00 підтверджено${this.demoTag}`);
	}
}
