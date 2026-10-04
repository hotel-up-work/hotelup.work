import { Component, computed, ElementRef, inject, signal, viewChild, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingRecord, BookingsService, checkOutPatch } from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { PaymentRecord, PaymentsService } from '../../feature/firebase/payments.service';
import { RoomRecord, RoomsService, RoomStatus } from '../../feature/firebase/rooms.service';
import { SubmissionsService } from '../../feature/firebase/submissions.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent, isLiveSession } from '../../shared/role';
import { arrivalsOn, balanceOf, departuresOn, lateArrivals, occupancyOn, occupiedRoomIds, overstays, sourceShares, weekFrom } from './dashboard-live';

interface Booking {
	id: number;
	name: string;
	room: string;
	guests: number;
	start: string;
	end: string;
	time: string;
	total: number;
	paid: number;
	status: string;
	source: string;
	created: string;
	setup?: boolean;
}

interface Room {
	number: string;
	status: string;
	staff: string;
	note: string;
}

interface Departure {
	name: string;
	room: string;
	time: string;
	done: boolean;
}

interface Guest {
	name: string;
	notes: string;
}

type DialogView =
	| { kind: 'booking'; id: number }
	| { kind: 'calendar' }
	| { kind: 'guests' }
	| { kind: 'payments' }
	| { kind: 'housekeeping'; number?: string }
	| { kind: 'rooms' }
	| { kind: 'departures' }
	| { kind: 'messages' }
	| { kind: 'automations' }
	| { kind: 'sales' }
	| { kind: 'revenue' }
	| { kind: 'team' }
	| { kind: 'settings' }
	| { kind: 'arrivals' }
	| { kind: 'bookings' }
	| { kind: 'new-booking' }
	| { kind: 'payment-form'; id: number }
	| { kind: 'add-guest' }
	| { kind: 'add-room' }
	| { kind: 'room-added'; number: string; price: number }
	| { kind: 'message-form' }
	| { kind: 'confirm-time' }
	| null;

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const initials = (n: string) =>
	n
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('');
const shortDate = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
		new Date(s + 'T12:00:00Z'),
	);
const dates = (b: Booking) =>
	b.start.slice(0, 7) === b.end.slice(0, 7)
		? `${Number(b.start.slice(-2))}–${shortDate(b.end)}`
		: shortDate(b.start) + ' – ' + shortDate(b.end);

const SEED_BOOKINGS: Booking[] = [
	{ id: 1841, name: 'Анна Коваленко', room: '204', guests: 2, start: '2026-09-17', end: '2026-09-20', time: '13:30', total: 4800, paid: 4800, status: 'Очікується', source: 'Instagram', created: '10 хв тому' },
	{ id: 1842, name: 'Олег Бондар', room: '103', guests: 1, start: '2026-09-17', end: '2026-09-18', time: '14:00', total: 2400, paid: 1200, status: 'Очікується', source: 'Телефон', created: 'Сьогодні' },
	{ id: 1843, name: 'Марія Петренко', room: '202', guests: 2, start: '2026-09-17', end: '2026-09-21', time: '16:30', total: 8400, paid: 8400, status: 'Підтверджено', source: 'Booking.com', created: 'Сьогодні' },
	{ id: 1844, name: 'Ірина Шевченко', room: '205', guests: 2, start: '2026-09-17', end: '2026-09-19', time: 'Не уточнено', total: 4400, paid: 4400, status: 'Очікується', source: 'Пряме бронювання', created: 'Сьогодні' },
	{ id: 1845, name: 'Дмитро Левченко', room: '206', guests: 2, start: '2026-09-17', end: '2026-09-20', time: '17:00', total: 5600, paid: 5600, status: 'Підтверджено', source: 'Google', created: 'Сьогодні' },
	{ id: 1846, name: 'Олена Романюк', room: '208', guests: 1, start: '2026-09-17', end: '2026-09-19', time: '18:00', total: 5000, paid: 2200, status: 'Очікується', source: 'Сайт', created: 'Сьогодні' },
	{ id: 1847, name: 'Максим Ткаченко', room: '209', guests: 2, start: '2026-09-17', end: '2026-09-20', time: '19:30', total: 6600, paid: 4400, status: 'Очікується', source: 'Booking.com', created: 'Сьогодні' },
	{ id: 1848, name: 'Андрій Мельник', room: '107', guests: 2, start: '2026-09-21', end: '2026-09-23', time: '14:00', total: 3400, paid: 3400, status: 'Підтверджено', source: 'Пряме бронювання', created: '32 хв тому' },
	{ id: 1849, name: 'Наталія Коваль', room: '302', guests: 2, start: '2026-09-25', end: '2026-09-28', time: '15:00', total: 7200, paid: 7200, status: 'Підтверджено', source: 'Google', created: '1 год тому' },
];

const ROOM_NUMBERS = [
	...Array.from({ length: 10 }, (_, i) => String(101 + i)),
	...Array.from({ length: 10 }, (_, i) => String(201 + i)),
	...Array.from({ length: 8 }, (_, i) => String(301 + i)),
];

function seedRooms(): Room[] {
	return ROOM_NUMBERS.map((n, i) => ({
		number: n,
		status:
			n === '204'
				? 'Прибирається'
				: ['207', '208', '209'].includes(n)
					? 'Потребує прибирання'
					: i < 6 && n !== '101'
						? 'Зайнятий'
						: n === '301'
							? 'Зайнятий'
							: 'Готовий',
		staff: n === '204' ? 'Марія' : n === '101' ? 'Оксана' : '',
		note:
			n === '101'
				? 'Наступний заїзд · 18 вересня'
				: n === '204'
					? 'Марія · Заїзд о 13:30'
					: n === '207'
						? 'Гість виїхав о 11:08'
						: '',
	}));
}

const OCCUPANCY_BASE = [79, 86, 93, 93, 71, 64, 68];

/** `YYYY-MM-DD` in the browser's time zone. */
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
	ready: 'Готовий',
	occupied: 'Зайнятий',
	'needs-cleaning': 'Потребує прибирання',
	cleaning: 'Прибирається',
	unavailable: 'Недоступний',
};

interface LiveKpi {
	icon: string;
	value: string;
	label: string;
	sub: string;
	link: string;
	warning: boolean;
	progress: boolean;
}

interface LiveIssue {
	icon: string;
	title: string;
	body: string;
	action: string;
	link: string;
}

@Component({
	selector: 'app-dashboard',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './dashboard.component.html',
	styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
	protected readonly showSalesCard = canCurrent('salesAnalytics');
	protected readonly showFinanceReports = canCurrent('financeReports');

	protected readonly money = money;
	protected readonly initials = initials;
	protected readonly dates = dates;

	private readonly _router = inject(Router);
	private readonly _hotel = inject(HotelService);
	private readonly _roomsService = inject(RoomsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _submissionsService = inject(SubmissionsService);
	private readonly _paymentsService = inject(PaymentsService);

	/** Real account: today's picture from the active hotel's rooms, bookings and website requests. */
	protected readonly live = isLiveSession();
	protected readonly canChange = canCurrent('changeBooking');
	protected readonly showFinance = canCurrent('guestBill');
	/** Hotel-wide receipts; other roles see only what they recorded themselves (CRM.md → Data visibility). */
	protected readonly financeReports = canCurrent('financeReports');
	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return "Grand Hotel · Кам'янець-Подільський";
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});
	protected readonly today = localDate(new Date());
	protected readonly todayLabel = (() => {
		const text = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
		return text.charAt(0).toUpperCase() + text.slice(1);
	})();

	protected readonly liveRooms = signal<RoomRecord[]>([]);
	protected readonly liveBookings = signal<BookingRecord[]>([]);
	protected readonly newSubmissions = signal(0);
	private readonly _livePayments = signal<PaymentRecord[]>([]);
	protected readonly saving = signal(false);
	protected readonly loadError = signal('');
	private readonly _roomsLoaded = signal(!this.live);
	private readonly _bookingsLoaded = signal(!this.live);
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());

	protected readonly bookings = signal<Booking[]>(SEED_BOOKINGS.map((b) => ({ ...b })));
	protected readonly rooms = signal<Room[]>(seedRooms());
	protected readonly departures = signal<Departure[]>([
		{ name: 'Юлія Савчук', room: '207', time: '11:08', done: true },
		{ name: 'Тарас Гончар', room: '208', time: '10:40', done: true },
		{ name: 'Віктор Коваль', room: '301', time: '12:00', done: false },
		{ name: 'Оксана Мельник', room: '302', time: '12:00', done: false },
	]);
	protected readonly guests = signal<Guest[]>([]);
	protected readonly messageDrafted = signal(false);
	protected readonly empty = signal(false);
	protected readonly revenue = signal(38400);
	protected readonly setupRooms = signal<Room[]>([]);
	protected readonly setupBookingDone = signal(false);
	protected readonly newRoomCount = signal(0);

	protected readonly arrivals = computed(() =>
		this.bookings().filter((b) => !b.setup && b.start === '2026-09-17'),
	);
	protected readonly unpaid = computed(() => this.bookings().filter((b) => !b.setup && b.total > b.paid));
	protected readonly unpaidTotal = computed(() =>
		this.unpaid().reduce((s, b) => s + (b.total - b.paid), 0),
	);
	protected readonly currentClean = computed(
		() => this.rooms().find((r) => r.number === '204')?.status !== 'Готовий',
	);
	protected readonly cleanCount = computed(
		() => this.rooms().filter((r) => r.status === 'Потребує прибирання').length,
	);
	protected readonly occupancyToday = computed(() => Math.round((this.occupancyForDay(17) / 28) * 100));

	protected readonly kpis = computed(() => {
		const count = this.arrivals().length;
		const clean = this.cleanCount();
		return [
			{ icon: 'arrival', value: String(count), label: 'Заїздів сьогодні', sub: 'Перший о 13:30', view: 'arrivals' as const, warning: false, growth: false, progress: false },
			{
				icon: 'departure',
				value: '4',
				label: 'Виїздів сьогодні',
				sub: `${this.departures().filter((x) => x.done).length} вже виїхали`,
				view: 'departures' as const,
				warning: false,
				growth: false,
				progress: false,
			},
			{
				icon: 'hotel',
				value: `${this.occupancyForDay(17)} / 28`,
				label: 'Номерів зайнято',
				sub: `${this.occupancyToday()}% завантаження`,
				view: 'calendar' as const,
				warning: false,
				growth: false,
				progress: true,
			},
			{
				icon: 'clean',
				value: String(clean),
				label: 'Потребують прибирання',
				sub: `${this.rooms().filter((r) => r.status === 'Прибирається').length} зараз прибирається`,
				view: 'housekeeping' as const,
				warning: true,
				growth: false,
				progress: false,
			},
			{
				icon: 'wallet',
				value: money(this.unpaidTotal()),
				label: 'Очікується оплата',
				sub: `${this.unpaid().length} бронювання`,
				view: 'payments' as const,
				warning: false,
				growth: false,
				progress: false,
			},
			this.showFinanceReports
				? {
						icon: 'chart',
						value: money(this.revenue()),
						label: 'Надходження сьогодні',
						sub: '+12% до минулого четверга',
						view: 'revenue' as const,
						warning: false,
						growth: true,
						progress: false,
					}
				: {
						icon: 'wallet',
						value: money(this.revenue()),
						label: 'Зібрано за зміну',
						sub: 'Оплати, прийняті на рецепції',
						view: 'payments' as const,
						warning: false,
						growth: false,
						progress: false,
					},
		];
	});

	protected readonly attentionIssues = computed(() => {
		const issues: { icon: string; title: string; body: string; action: string; view?: DialogView; bookingId?: number; onAction?: () => void }[] = [];
		if (this.currentClean()) {
			issues.push({
				icon: 'clean',
				title: 'Номер 204 ще не готовий',
				body: `Заїзд о <b>13:30</b> · Відповідальна: Марія`,
				action: 'Відкрити прибирання',
				view: { kind: 'housekeeping' },
			});
		}
		const oleg = this.bookings().find((b) => b.id === 1842)!;
		if (oleg.total > oleg.paid) {
			issues.push({
				icon: 'wallet',
				title: 'Не отримано оплату',
				body: `Олег Бондар · #1842<br>Залишок: <b>${money(oleg.total - oleg.paid)}</b>`,
				action: 'Відкрити бронювання',
				bookingId: 1842,
			});
		}
		const irina = this.bookings().find((b) => b.id === 1844)!;
		if (irina.time === 'Не уточнено') {
			issues.push({
				icon: 'message',
				title: 'Гість не підтвердив час заїзду',
				body:
					'Ірина Шевченко · Заїзд сьогодні' +
					(this.messageDrafted() ? '<br>Чернетку підготовлено · Час ще не підтверджено' : ''),
				action: 'Надіслати повідомлення',
				onAction: () => this.openDialog({ kind: 'message-form' }),
			});
		}
		return issues;
	});

	protected readonly roomSummary = computed(() => {
		const rs: [string, string][] = [
			['Готовий', 'Готові'],
			['Потребує прибирання', 'Потребують прибирання'],
			['Прибирається', 'Прибирається'],
			['Зайнятий', 'Зайняті'],
		];
		return rs.map(([status, label]) => ({
			count: this.rooms().filter((r) => r.status === status).length,
			label,
		}));
	});

	protected readonly roomList = computed(() =>
		['101', '204', '207'].map((n) => this.rooms().find((r) => r.number === n)!),
	);

	protected readonly newBookings = computed(() => {
		const b = this.bookings();
		const latest = [
			...b.filter((x) => x.id > 1849 && !x.setup).reverse(),
			b[0],
			b.find((x) => x.id === 1848)!,
			b.find((x) => x.id === 1849)!,
		];
		return latest.slice(0, 3);
	});

	protected readonly occupancyChart = computed(() =>
		OCCUPANCY_BASE.map((_, i) => {
			const v = Math.round((this.occupancyForDay(17 + i) / 28) * 100);
			return { day: 17 + i, value: v, label: ['Чт', 'Пт', 'Сб', 'Нд', 'Пн', 'Вт', 'Ср'][i] };
		}),
	);

	protected readonly sources = [
		{ name: 'Прямі бронювання', value: 34 },
		{ name: 'Booking.com', value: 28 },
		{ name: 'Instagram', value: 18 },
		{ name: 'Google', value: 12 },
		{ name: 'Інше', value: 8 },
	];

	protected readonly insightText = computed(() => {
		const clean = this.currentClean();
		const u = this.unpaid();
		return {
			occupancy: this.occupancyToday(),
			room204: clean
				? 'Номер <b>204</b> потрібно підготувати до <b>13:30.</b>'
				: 'Номер <b>204</b> готовий до заїзду о <b>13:30.</b>',
			unpaid: u.length
				? `<b>${u.length} бронювання</b> мають неоплачений залишок на загальну суму <b>${money(this.unpaidTotal())}.</b>`
				: 'Усі показані бронювання оплачені.',
		};
	});

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly formError = signal('');
	protected readonly searchQuery = signal('');
	protected readonly searchResults = computed(() => {
		const q = this.searchQuery().toLocaleLowerCase('uk-UA').trim();
		if (!q) return this.bookings();
		return this.bookings().filter((b) =>
			(b.name + ' ' + b.room + ' #' + b.id).toLocaleLowerCase('uk-UA').includes(q),
		);
	});

	/** A room's state now: a guest in the house wins, then the stored status (a stale hand-set "occupied" counts as ready). */
	private _roomState(room: RoomRecord): RoomStatus {
		if (room.status === 'unavailable') return 'unavailable';
		if (occupiedRoomIds(this.liveBookings()).has(room.id)) return 'occupied';
		return room.status === 'occupied' ? 'ready' : room.status;
	}

	protected roomNumber(b: BookingRecord): string {
		return this.liveRooms().find((r) => r.id === b.roomId)?.number ?? b.roomNumber;
	}

	protected stay(b: BookingRecord): string {
		return b.checkIn.slice(0, 7) === b.checkOut.slice(0, 7)
			? `${Number(b.checkIn.slice(-2))}–${shortDate(b.checkOut)}`
			: shortDate(b.checkIn) + ' – ' + shortDate(b.checkOut);
	}

	protected readonly statusLabel = (status: RoomStatus) => ROOM_STATUS_LABEL[status];
	protected readonly balanceOf = balanceOf;

	protected bookingStatusLabel(b: BookingRecord): string {
		return { pending: 'Очікує', confirmed: 'Підтверджено', checkedin: 'Заїхав', checkedout: 'Виїхав', cancelled: 'Скасовано' }[b.status];
	}

	protected readonly lArrivals = computed(() => arrivalsOn(this.liveBookings(), this.today));
	protected readonly lDepartures = computed(() => departuresOn(this.liveBookings(), this.today));
	protected readonly lStates = computed(() => this.liveRooms().map((room) => ({ room, state: this._roomState(room) })));
	protected readonly lUnpaid = computed(() => this.liveBookings().filter((b) => b.status !== 'cancelled' && balanceOf(b) > 0));

	protected readonly lKpis = computed<LiveKpi[]>(() => {
		const states = this.lStates();
		const occupied = states.filter((x) => x.state === 'occupied').length;
		const arrivals = this.lArrivals();
		const departures = this.lDepartures();
		const kpis: LiveKpi[] = [
			{ icon: 'arrival', value: String(arrivals.length), label: 'Заїздів сьогодні', sub: `${arrivals.filter((b) => b.status === 'checkedin').length} вже заїхали`, link: '/calendar', warning: false, progress: false },
			{ icon: 'departure', value: String(departures.length), label: 'Виїздів сьогодні', sub: `${departures.filter((b) => b.status === 'checkedout').length} вже виїхали`, link: '/calendar', warning: false, progress: false },
			{ icon: 'hotel', value: `${occupied} / ${states.length}`, label: 'Номерів зайнято', sub: `${states.length ? Math.round((occupied / states.length) * 100) : 0}% зараз`, link: '/rooms', warning: false, progress: true },
			{ icon: 'clean', value: String(states.filter((x) => x.state === 'needs-cleaning').length), label: 'Потребують прибирання', sub: `${states.filter((x) => x.state === 'cleaning').length} зараз прибирається`, link: '/rooms', warning: true, progress: false },
		];
		if (this.showFinance) {
			const total = this.lUnpaid().reduce((sum, b) => sum + balanceOf(b), 0);
			const uid = this._paymentsService.recorder().uid;
			const received = this._livePayments()
				.filter((p) => p.occurredOn === this.today && (this.financeReports || p.recordedByUid === uid))
				.reduce((sum, p) => sum + p.amount, 0);
			kpis.push({ icon: 'chart', value: money(received), label: this.financeReports ? 'Надходження сьогодні' : 'Зібрано вами сьогодні', sub: 'За журналом оплат', link: '/payments', warning: false, progress: false });
			kpis.push({ icon: 'wallet', value: money(total), label: 'Очікується оплата', sub: `${this.lUnpaid().length} бронювання`, link: '/payments', warning: false, progress: false });
		}
		kpis.push({ icon: 'send', value: String(this.newSubmissions()), label: 'Нові заявки', sub: 'Чекають на відповідь', link: '/submissions', warning: this.newSubmissions() > 0, progress: false });
		return kpis;
	});

	/** Share of rooms with a guest in the house, for the occupancy KPI's progress bar. */
	protected readonly lOccupiedPercent = computed(() => {
		const states = this.lStates();
		return states.length ? Math.round((states.filter((x) => x.state === 'occupied').length / states.length) * 100) : 0;
	});

	protected readonly lIssues = computed<LiveIssue[]>(() => {
		const issues: LiveIssue[] = [];
		const bookings = this.liveBookings();
		const states = new Map(this.lStates().map((x) => [x.room.id, x.state]));
		for (const b of overstays(bookings, this.today)) {
			issues.push({ icon: 'attention', title: 'Гість не виїхав вчасно', body: `${b.guestName} · номер ${this.roomNumber(b)} · виїзд мав бути ${shortDate(b.checkOut)}`, action: 'Відкрити календар', link: '/calendar' });
		}
		for (const b of this.lArrivals().filter((x) => x.status !== 'checkedin')) {
			const state = states.get(b.roomId);
			if (state && state !== 'ready') {
				issues.push({ icon: 'clean', title: `Номер ${this.roomNumber(b)} не готовий до заїзду`, body: `${b.guestName} · Заїзд сьогодні · ${ROOM_STATUS_LABEL[state]}`, action: 'Відкрити номери', link: '/rooms' });
			}
		}
		for (const b of lateArrivals(bookings, this.today)) {
			issues.push({ icon: 'arrival', title: 'Гість ще не заїхав', body: `${b.guestName} · номер ${this.roomNumber(b)} · заїзд був ${shortDate(b.checkIn)}`, action: 'Відкрити календар', link: '/calendar' });
		}
		if (this.showFinance) {
			for (const b of this.lArrivals().filter((x) => balanceOf(x) > 0)) {
				issues.push({ icon: 'wallet', title: 'Не отримано оплату', body: `${b.guestName} · номер ${this.roomNumber(b)} · Залишок ${money(balanceOf(b))}`, action: 'Відкрити календар', link: '/calendar' });
			}
		}
		const waiting = bookings.filter((b) => b.status === 'pending' && b.checkOut >= this.today).length;
		if (waiting) {
			issues.push({ icon: 'attention', title: 'Бронювання очікують підтвердження', body: `Не підтверджено: ${waiting}`, action: 'Відкрити календар', link: '/calendar' });
		}
		return issues;
	});

	protected readonly lRoomSummary = computed(() => {
		const states = this.lStates();
		const count = (status: RoomStatus) => states.filter((x) => x.state === status).length;
		return [
			{ count: count('ready'), label: 'Готові', gold: false },
			{ count: count('needs-cleaning'), label: 'Потребують прибирання', gold: true },
			{ count: count('cleaning'), label: 'Прибирається', gold: true },
			{ count: count('occupied'), label: 'Зайняті', gold: false },
		];
	});

	/** Rooms that need someone's attention: waiting for cleaning, being cleaned, or blocked. */
	protected readonly lRoomList = computed(() =>
		this.lStates()
			.filter((x) => x.state === 'needs-cleaning' || x.state === 'cleaning' || x.state === 'unavailable')
			.slice(0, 4)
			.map((x) => ({
				number: x.room.number,
				state: x.state,
				note: x.state === 'unavailable' ? (x.room.block?.reason ?? '') : x.state === 'cleaning' ? 'Прибирання розпочато' : 'Гість виїхав',
			})),
	);

	protected readonly lNewBookings = computed(() =>
		[...this.liveBookings()]
			.filter((b) => b.status !== 'cancelled')
			.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
			.slice(0, 3),
	);

	protected createdLabel(b: BookingRecord): string {
		if (!b.createdAt) return '';
		const day = localDate(b.createdAt);
		if (day === this.today) return 'Сьогодні';
		return day === localDate(new Date(Date.now() - 86_400_000)) ? 'Вчора' : `${day.slice(8, 10)}.${day.slice(5, 7)}`;
	}

	protected readonly lOccupancy = computed(() =>
		weekFrom(this.today).map((d) => ({ ...d, value: occupancyOn(this.liveBookings(), this.liveRooms(), d.date) })),
	);
	protected readonly lSources = computed(() => sourceShares(this.liveBookings(), this.today.slice(0, 7)));

	protected go(url: string): void {
		this._router.navigateByUrl(url);
	}

	protected async checkInLive(b: BookingRecord): Promise<void> {
		const hotelId = this.hotelId();
		const room = this.liveRooms().find((r) => r.id === b.roomId);
		if (!hotelId || !room || !this.canChange || this.saving()) return;
		const state = this._roomState(room);
		if (state === 'occupied') return this.toast(`У номері ${room.number} ще проживає гість`);
		if (state !== 'ready') return this.toast(`Спочатку підготуйте номер ${room.number}: ${ROOM_STATUS_LABEL[state].toLowerCase()}`);
		this.saving.set(true);
		try {
			await this._bookingsService.update(hotelId, b.id, { status: 'checkedin' });
			this.toast(`Заїзд відмічено · номер ${room.number}`);
		} catch (error) {
			console.error('Check-in failed', error);
			this.toast('Не вдалося відмітити заїзд. Перевірте зʼєднання та спробуйте ще раз.');
		} finally {
			this.saving.set(false);
		}
	}

	protected async checkOutLive(b: BookingRecord): Promise<void> {
		const hotelId = this.hotelId();
		const room = this.liveRooms().find((r) => r.id === b.roomId);
		if (!hotelId || !this.canChange || this.saving()) return;
		this.saving.set(true);
		try {
			await this._bookingsService.update(hotelId, b.id, checkOutPatch(b, this.today).patch);
		} catch (error) {
			console.error('Check-out failed', error);
			this.saving.set(false);
			return this.toast('Не вдалося відмітити виїзд. Перевірте зʼєднання та спробуйте ще раз.');
		}
		let roomMarked = true;
		if (room && room.status !== 'unavailable') {
			try {
				await this._roomsService.updateRoom(hotelId, room.id, { status: 'needs-cleaning' });
			} catch (error) {
				console.error('Room status update failed', error);
				roomMarked = false;
			}
		}
		this.saving.set(false);
		this.toast(roomMarked ? 'Виїзд відмічено · номер потребує прибирання' : 'Виїзд відмічено, але статус номера не змінено. Позначте його на сторінці «Номери».');
	}

	constructor() {
		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!this.live || !hotelId) return;
			this.liveRooms.set([]);
			this.liveBookings.set([]);
			this.newSubmissions.set(0);
			this._livePayments.set([]);
			this._roomsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			const onError = (error: Error) => {
				console.error('Dashboard listener failed', error);
				this.loadError.set('Не вдалося завантажити огляд. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopRooms = this._roomsService.listenRooms(
				hotelId,
				(rooms) => {
					this.liveRooms.set(rooms);
					this._roomsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(bookings) => {
					this.liveBookings.set(bookings);
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			// Website requests are a bonus tile: a failure here must not hide the rest.
			const stopSubmissions = this._submissionsService.listen(
				hotelId,
				(submissions) => this.newSubmissions.set(submissions.filter((x) => x.status === 'new').length),
				(error) => console.error('Dashboard submissions listener failed', error),
			);
			// Receipts are a bonus tile too.
			const stopPayments = this._paymentsService.listen(
				hotelId,
				(payments) => this._livePayments.set(payments),
				(error) => console.error('Dashboard payments listener failed', error),
			);
			onCleanup(() => {
				stopRooms();
				stopBookings();
				stopSubmissions();
				stopPayments();
			});
		});

		effect(() => {
			const dialog = this.dialogRef()?.nativeElement;
			if (!dialog) return;
			if (this.dialogView() !== null) {
				if (!dialog.open) dialog.showModal();
			} else if (dialog.open) {
				dialog.close();
			}
		});
	}

	private occupancyForDay(d: number): number {
		return Math.min(
			28,
			Math.round((OCCUPANCY_BASE[d - 17] * 28) / 100) +
				this.bookings().filter(
					(b) => b.id > 1849 && !b.setup && b.start <= `2026-09-${d}` && b.end > `2026-09-${d}`,
				).length,
		);
	}

	protected bookingOnDay(room: string, day: number): Booking | undefined {
		return this.bookings().find(
			(b) => b.room === room && Number(b.start.slice(-2)) <= day && Number(b.end.slice(-2)) > day,
		);
	}

	protected booking(id: number): Booking | undefined {
		return this.bookings().find((b) => b.id === id);
	}

	protected roomFor(b: Booking): Room | undefined {
		return (b.setup ? this.setupRooms() : this.rooms()).find((r) => r.number === b.room);
	}

	protected openDialog(view: DialogView): void {
		this.formError.set('');
		this.dialogView.set(view);
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

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected markCleanReady(number: string): void {
		this.rooms.update((rooms) =>
			rooms.map((r) =>
				r.number === number
					? { ...r, status: 'Готовий', note: (r.staff || 'Марія') + ' · Номер підготовлений' }
					: r,
			),
		);
		this.toast('Номер ' + number + ' готовий · Демо');
	}

	protected startClean(number: string): void {
		this.rooms.update((rooms) =>
			rooms.map((r) =>
				r.number === number ? { ...r, status: 'Прибирається', staff: 'Марія', note: 'Марія · Прибирання розпочато' } : r,
			),
		);
		this.toast('Прибирання розпочато · Демо');
	}

	protected checkIn(id: number): void {
		const b = this.booking(id);
		if (!b) return;
		const room = this.roomFor(b);
		if (!room || room.status !== 'Готовий') {
			this.toast('Спочатку підготуйте номер ' + b.room);
			return;
		}
		this.bookings.update((bs) => bs.map((x) => (x.id === id ? { ...x, status: 'Заїхав' } : x)));
		this.rooms.update((rooms) =>
			rooms.map((r) => (r.number === b.room ? { ...r, status: 'Зайнятий', note: b.name + ' · ' + dates(b) } : r)),
		);
		this.toast('Заїзд відмічено · Демо');
	}

	protected checkOut(index: number): void {
		this.departures.update((deps) => deps.map((d, i) => (i === index ? { ...d, done: true } : d)));
		const d = this.departures()[index];
		this.rooms.update((rooms) =>
			rooms.map((r) =>
				r.number === d.room ? { ...r, status: 'Потребує прибирання', note: 'Гість виїхав · Потрібне прибирання' } : r,
			),
		);
		this.toast('Виїзд відмічено · Демо');
	}

	protected confirmArrivalTime(time: string): void {
		this.bookings.update((bs) => bs.map((b) => (b.id === 1844 ? { ...b, time } : b)));
		this.openDialog({ kind: 'booking', id: 1844 });
		this.toast('Час заїзду уточнено · Демо');
	}

	protected submitPayment(id: number, amount: number): void {
		const b = this.booking(id);
		if (!b || amount <= 0 || amount > b.total - b.paid || !Number.isFinite(amount)) return;
		this.bookings.update((bs) => bs.map((x) => (x.id === id ? { ...x, paid: x.paid + amount } : x)));
		if (!b.setup) this.revenue.update((r) => r + amount);
		this.openDialog({ kind: 'booking', id });
		this.toast('Оплату відмічено · ' + money(amount) + ' · Демо');
	}

	protected submitNewBooking(form: {
		name: string;
		start: string;
		end: string;
		room: string;
		guests: number;
		time: string;
		total: number;
		source: string;
	}): void {
		const name = form.name.trim();
		let error = '';
		if (!name) error = "Вкажіть ім'я гостя.";
		else if (form.end <= form.start) error = 'Виїзд має бути після заїзду.';
		else if (
			this.bookings().some(
				(b) => Boolean(b.setup) === this.empty() && b.room === form.room && form.start < b.end && form.end > b.start,
			)
		)
			error = 'Номер зайнятий у ці дати. Оберіть інший номер.';

		if (error) {
			this.formError.set(error);
			return;
		}

		const id = Math.max(...this.bookings().map((b) => b.id)) + 1;
		const booking: Booking = {
			setup: this.empty(),
			id,
			name,
			room: form.room,
			start: form.start,
			end: form.end,
			guests: form.guests,
			time: form.time,
			total: form.total,
			paid: 0,
			status: 'Підтверджено',
			source: form.source,
			created: 'Щойно',
		};
		this.bookings.update((bs) => [...bs, booking]);
		if (this.empty()) this.setupBookingDone.set(true);
		this.openDialog({ kind: 'booking', id });
		this.toast('Демонстраційне бронювання #' + id + ' створено');
	}

	protected submitAddGuest(name: string, notes: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		this.guests.update((gs) => [...gs, { name: trimmed, notes: notes.trim() }]);
		this.openDialog({ kind: 'guests' });
		this.toast('Демонстраційного гостя додано');
	}

	protected submitAddRoom(number: string, price: number): void {
		const n = number.trim();
		if (!n) return;
		if (this.setupRooms().some((r) => r.number === n)) {
			this.toast('Цей номер уже додано');
			return;
		}
		this.setupRooms.update((rooms) => [...rooms, { number: n, staff: '', note: 'Новий номер', status: 'Готовий' }]);
		this.newRoomCount.update((c) => c + 1);
		this.openDialog({ kind: 'room-added', number: n, price });
	}

	protected submitMessage(text: string): void {
		this.messageDrafted.set(true);
		this.openDialog(null);
		this.toast('Чернетку підготовлено · Не надіслано');
	}

	protected goEmpty(): void {
		this.empty.set(true);
		this.closeDialog();
	}

	protected goPopulated(): void {
		this.empty.set(false);
	}

	protected guestBookings(name: string) {
		return this.bookings().filter((b) => b.name === name);
	}

	protected uniqueGuestNames = computed(() => [
		...new Set(this.bookings().map((b) => b.name)),
		...this.guests().map((g) => g.name),
	]);
}
