import { afterNextRender, Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingInput, BookingRecord, BookingsService, isoAddDays } from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { RoomRecord, RoomsService } from '../../feature/firebase/rooms.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { nightsBetween, phoneDigits, roomIsFree } from '../../shared/booking-rules';
import { canCurrent } from '../../shared/role';

type Payment = 'none' | 'half' | 'full';

interface Created {
	guest: string;
	room: string;
	start: string;
	end: string;
	total: number;
	pending: boolean;
}

const SOURCES = ['Телефон', 'Walk-in', 'Пряме бронювання', 'Сайт', 'Instagram', 'Google', 'Booking.com', 'Інше'];
const NIGHT_CHOICES = [1, 2, 3, 5, 7];
const MAX_NIGHTS = 90;

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const shortDate = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(s + 'T00:00:00Z'));
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Ukrainian plural: 1 ніч, 2 ночі, 5 ночей. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
const nightsLabel = (n: number) => `${n} ${plural(n, 'ніч', 'ночі', 'ночей')}`;
const guestsLabel = (n: number) => `${n} ${plural(n, 'гість', 'гості', 'гостей')}`;

/**
 * Real hotels: the fast desk form for the daily "a guest calls / walks in" booking. Dates and guests
 * decide which rooms are free, the cheapest fitting room is picked for you, a known phone fills in the
 * guest, and Enter creates the booking. Same rules and data as the Calendar (CRM.md → Booking data contract).
 */
@Component({
	selector: 'app-quick-booking',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './quick-booking.component.html',
	styleUrl: './quick-booking.component.scss',
})
export class QuickBookingComponent {
	private readonly _roomsService = inject(RoomsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _hotel = inject(HotelService);
	private readonly _route = inject(ActivatedRoute);

	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly SOURCES = SOURCES;
	protected readonly NIGHT_CHOICES = NIGHT_CHOICES;
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly nightsLabel = nightsLabel;
	protected readonly guestsLabel = guestsLabel;

	/** Only roles that may change bookings confirm one; Sales creates a hold. Payment needs the bill capability. */
	protected readonly canChange = canCurrent('changeBooking');
	protected readonly canCollect = canCurrent('collectPayment') && canCurrent('guestBill');

	protected readonly today = localDate(new Date());
	protected readonly rooms = signal<RoomRecord[]>([]);
	private readonly _bookings = signal<BookingRecord[]>([]);
	private readonly _roomsLoaded = signal(false);
	private readonly _bookingsLoaded = signal(false);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());

	// Stay
	protected readonly start = signal(this.today);
	protected readonly nights = signal(1);
	protected readonly guests = signal(2);
	protected readonly typeFilter = signal('all');
	protected readonly roomId = signal('');
	/** null = nights × room price. */
	protected readonly totalOverride = signal<number | null>(null);
	// Guest
	protected readonly phone = signal('');
	protected readonly name = signal('');
	protected readonly email = signal('');
	protected readonly notes = signal('');
	protected readonly source = signal(SOURCES[0]);
	protected readonly payment = signal<Payment>('none');

	protected readonly saving = signal(false);
	protected readonly error = signal('');
	protected readonly created = signal<Created | null>(null);

	private readonly _phoneInput = viewChild<ElementRef<HTMLInputElement>>('phoneInput');
	private readonly _queryParams = toSignal(this._route.queryParamMap);
	private _prefilled = false;

	protected readonly end = computed(() => isoAddDays(this.start(), this.nights()));

	protected readonly types = computed(() => [...new Set(this.rooms().map((r) => r.type))]);

	/** Rooms free for the whole stay and big enough, cheapest first. */
	protected readonly freeRooms = computed(() => {
		const start = this.start();
		const end = this.end();
		const guests = this.guests();
		const type = this.typeFilter();
		return this.rooms()
			.filter((r) => (type === 'all' || r.type === type) && r.capacity >= guests && roomIsFree(r, this._bookings(), start, end))
			.sort((a, b) => a.price - b.price || a.number.localeCompare(b.number, 'uk', { numeric: true }));
	});

	/** Why other rooms are not listed: busy, blocked, or too small. */
	protected readonly hiddenCount = computed(() => {
		const type = this.typeFilter();
		const inType = this.rooms().filter((r) => type === 'all' || r.type === type).length;
		return inType - this.freeRooms().length;
	});

	protected readonly room = computed(() => this.freeRooms().find((r) => r.id === this.roomId()) ?? null);
	protected readonly autoTotal = computed(() => this.nights() * (this.room()?.price ?? 0));
	protected readonly total = computed(() => this.totalOverride() ?? this.autoTotal());
	protected readonly paidNow = computed(() => {
		if (!this.canCollect) return 0;
		const total = Math.max(0, Math.round(this.total()));
		return this.payment() === 'full' ? total : this.payment() === 'half' ? Math.round(total / 2) : 0;
	});

	/** A returning guest: the latest booking whose phone contains the digits typed so far (7 or more). */
	protected readonly knownGuest = computed(() => {
		const digits = phoneDigits(this.phone());
		if (digits.length < 7) return null;
		const matches = this._bookings()
			.filter((b) => phoneDigits(b.phone).includes(digits))
			.sort((a, b) => b.checkIn.localeCompare(a.checkIn));
		if (!matches.length) return null;
		const latest = matches[0];
		return { name: latest.guestName, email: latest.email, stays: matches.filter((b) => b.status !== 'cancelled').length };
	});

	protected readonly ready = computed(() => !!this.hotelId() && !this.loading() && !this.loadError());

	constructor() {
		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!hotelId) return;
			this.rooms.set([]);
			this._bookings.set([]);
			this._roomsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			const onError = (error: Error) => {
				console.error('New booking listener failed', error);
				this.loadError.set('Не вдалося завантажити номери та бронювання. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopRooms = this._roomsService.listenRooms(
				hotelId,
				(records) => {
					this.rooms.set(records);
					this._roomsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(records) => {
					this._bookings.set(records);
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			onCleanup(() => {
				stopRooms();
				stopBookings();
			});
		});

		// ?room=101&start=2026-10-05&nights=2&guests=3 (from the Calendar, Rooms or a link) preselects the stay once.
		effect(() => {
			const params = this._queryParams();
			if (this._prefilled || !params || !this.ready()) return;
			this._prefilled = true;
			untracked(() => this._prefill(params.get('room'), params.get('start'), params.get('end'), params.get('guests')));
		});

		// Keep the choice valid: when the dates, guests or bookings change and the room is gone, pick the cheapest free one.
		effect(() => {
			const free = this.freeRooms();
			untracked(() => {
				if (!free.some((r) => r.id === this.roomId())) this.roomId.set(free[0]?.id ?? '');
			});
		});

		afterNextRender(() => this._phoneInput()?.nativeElement.focus());
	}

	private _prefill(roomNumber: string | null, start: string | null, end: string | null, guests: string | null): void {
		const validDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
		const from = validDate(start);
		const to = validDate(end);
		if (from) this.start.set(from);
		if (from && to && to > from) this.nights.set(Math.min(MAX_NIGHTS, nightsBetween(from, to)));
		const g = Number(guests);
		if (Number.isInteger(g) && g >= 1) this.guests.set(Math.min(g, 50));
		const room = this.rooms().find((r) => r.number === roomNumber);
		if (room) {
			this.typeFilter.set('all');
			this.guests.update((current) => Math.min(current, room.capacity));
			this.roomId.set(room.id);
		}
	}

	protected setStart(value: string): void {
		if (value) this.start.set(value);
	}

	protected setEnd(value: string): void {
		const nights = value ? nightsBetween(this.start(), value) : 0;
		if (nights >= 1) this.nights.set(Math.min(MAX_NIGHTS, nights));
	}

	protected setNights(value: number): void {
		if (Number.isInteger(value) && value >= 1) this.nights.set(Math.min(MAX_NIGHTS, value));
	}

	protected stepNights(delta: number): void {
		this.setNights(this.nights() + delta);
	}

	protected stepGuests(delta: number): void {
		this.guests.update((g) => Math.min(50, Math.max(1, g + delta)));
	}

	protected setTotal(value: unknown): void {
		this.totalOverride.set(value === null || value === '' || Number.isNaN(Number(value)) ? null : Math.max(0, Number(value)));
	}

	protected useKnownGuest(): void {
		const known = this.knownGuest();
		if (!known) return;
		this.name.set(known.name);
		if (known.email && !this.email()) this.email.set(known.email);
	}

	protected async submit(): Promise<void> {
		if (this.saving() || !this.ready()) return;
		const hotelId = this.hotelId()!;
		const room = this.room();
		const name = this.name().trim();
		const phone = this.phone().trim();
		if (!name && !phone) return this.error.set('Вкажіть телефон або ім’я гостя.');
		if (!room) return this.error.set('Оберіть номер: на ці дати вільних номерів немає.');
		// Another tab or colleague may have taken the room since the list was drawn.
		if (!roomIsFree(room, this._bookings(), this.start(), this.end())) return this.error.set(`Номер ${room.number} уже зайнятий на ці дати. Оберіть інший.`);
		const total = Math.max(0, Math.round(this.total()));
		const input: BookingInput = {
			roomId: room.id,
			roomNumber: room.number,
			guestName: name || phone,
			phone,
			email: this.email().trim(),
			checkIn: this.start(),
			checkOut: this.end(),
			guests: this.guests(),
			total,
			paid: this.paidNow(),
			status: this.canChange ? 'confirmed' : 'pending',
			source: this.source(),
			notes: this.notes().trim(),
		};
		this.error.set('');
		this.saving.set(true);
		try {
			await this._bookingsService.add(hotelId, input);
		} catch (error) {
			console.error('Booking create failed', error);
			this.saving.set(false);
			return this.error.set('Не вдалося створити бронювання. Перевірте зʼєднання та спробуйте ще раз.');
		}
		this.saving.set(false);
		this.created.set({ guest: input.guestName, room: room.number, start: input.checkIn, end: input.checkOut, total, pending: input.status === 'pending' });
	}

	/** After a booking: a clean form for the next guest; the dates and source stay, as desks often book several in a row. */
	protected another(): void {
		this.created.set(null);
		this.phone.set('');
		this.name.set('');
		this.email.set('');
		this.notes.set('');
		this.guests.set(2);
		this.totalOverride.set(null);
		this.payment.set('none');
		this.error.set('');
		queueMicrotask(() => this._phoneInput()?.nativeElement.focus());
	}
}
