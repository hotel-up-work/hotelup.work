import { afterNextRender, Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingInput, BookingRecord, BookingsService, isoAddDays } from '../../feature/firebase/bookings.service';
import { GuestRecord, GuestsService, phoneKey } from '../../feature/firebase/guests.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { HotelSettingsService } from '../../feature/firebase/hotel-settings.service';
import { PaymentMethod, PaymentsService } from '../../feature/firebase/payments.service';
import { RoomRecord, RoomsService } from '../../feature/firebase/rooms.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { nightsBetween, roomIsFree } from '../../shared/booking-rules';
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
/** Suggestions for the price list field; any text is accepted. */
const RATES = ['Стандартний', 'Rack rate', 'Корпоративний', 'Акційний', 'Для сайту'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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
	private readonly _guestsService = inject(GuestsService);
	private readonly _paymentsService = inject(PaymentsService);
	private readonly _settings = inject(HotelSettingsService);
	/** Only the payment methods the hotel has switched on in Settings. */
	protected readonly paymentMethods = this._settings.methods;
	private readonly _hotel = inject(HotelService);
	private readonly _route = inject(ActivatedRoute);

	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly SOURCES = SOURCES;
	protected readonly RATES = RATES;
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
	private readonly _guests = signal<GuestRecord[]>([]);
	private readonly _roomsLoaded = signal(false);
	private readonly _bookingsLoaded = signal(false);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());

	// Stay
	protected readonly start = signal(this.today);
	protected readonly nights = signal(1);
	protected readonly adults = signal(2);
	protected readonly children = signal(0);
	/** Everyone staying, adults and children. */
	protected readonly guests = computed(() => this.adults() + this.children());
	/** Start from the hotel's times in Settings until the person edits them for this booking. */
	protected readonly checkInTime = signal(this._settings.checkIn());
	protected readonly checkOutTime = signal(this._settings.checkOut());
	private _timesEdited = false;
	protected readonly typeFilter = signal('all');
	protected readonly roomId = signal('');
	/** null = nights × room price. */
	protected readonly totalOverride = signal<number | null>(null);
	// Guest
	protected readonly phone = signal('');
	protected readonly name = signal('');
	protected readonly email = signal('');
	protected readonly notes = signal('');
	protected readonly housekeepingNote = signal('');
	protected readonly rate = signal('');
	protected readonly byBed = signal(false);
	protected readonly bedNumber = signal(1);
	protected readonly source = signal(SOURCES[0]);
	protected readonly payment = signal<Payment>('none');
	protected readonly method = signal<PaymentMethod>(this.paymentMethods()[0]?.value ?? 'cash');

	protected readonly saving = signal(false);
	protected readonly error = signal('');
	protected readonly created = signal<Created | null>(null);

	private readonly _phoneInput = viewChild<ElementRef<HTMLInputElement>>('phoneInput');
	private readonly _queryParams = toSignal(this._route.queryParamMap);
	private _prefilled = false;
	private _pendingGuestId: string | null = null;

	protected readonly end = computed(() => isoAddDays(this.start(), this.nights()));

	protected readonly types = computed(() => [...new Set(this.rooms().map((r) => r.type))]);

	/** Rooms free for the whole stay and big enough, cheapest first. */
	protected readonly freeRooms = computed(() => {
		const start = this.start();
		const end = this.end();
		const guests = this.guests();
		const type = this.typeFilter();
		return this.rooms()
			.filter((r) => (type === 'all' || r.type === type) && r.capacity + r.extraGuests >= guests && roomIsFree(r, this._bookings(), start, end))
			.sort((a, b) => a.price - b.price || a.number.localeCompare(b.number, 'uk', { numeric: true }));
	});

	/** Why other rooms are not listed: busy, blocked, or too small. */
	protected readonly hiddenCount = computed(() => {
		const type = this.typeFilter();
		const inType = this.rooms().filter((r) => type === 'all' || r.type === type).length;
		return inType - this.freeRooms().length;
	});

	protected readonly room = computed(() => this.freeRooms().find((r) => r.id === this.roomId()) ?? null);
	/** People beyond the room's capacity; each is charged the room's extra-guest price per night. */
	protected readonly extraPlaces = computed(() => {
		const room = this.room();
		return room ? Math.min(room.extraGuests, Math.max(0, this.guests() - room.capacity)) : 0;
	});
	protected readonly autoTotal = computed(() => this.nights() * ((this.room()?.price ?? 0) + this.extraPlaces() * (this.room()?.extraGuestPrice ?? 0)));
	protected readonly total = computed(() => this.totalOverride() ?? this.autoTotal());
	protected readonly paidNow = computed(() => {
		if (!this.canCollect) return 0;
		const total = Math.max(0, Math.round(this.total()));
		return this.payment() === 'full' ? total : this.payment() === 'half' ? Math.round(total / 2) : 0;
	});

	/** A returning guest: the guest whose phone matches what is typed (needs 7 or more digits). */
	protected readonly knownGuest = computed(() => {
		const key = phoneKey(this.phone());
		if (!key) return null;
		const guest = this._guests().find((g) => phoneKey(g.phone) === key);
		if (!guest) return null;
		const stays = this._bookings().filter((b) => b.guestId === guest.id && b.status !== 'cancelled').length;
		return { id: guest.id, name: guest.name, email: guest.email, stays };
	});

	protected readonly ready = computed(() => !!this.hotelId() && !this.loading() && !this.loadError());

	constructor() {
		// The hotel's times arrive a moment after the page opens; apply them unless this booking's times were already edited.
		effect(() => {
			const checkIn = this._settings.checkIn();
			const checkOut = this._settings.checkOut();
			untracked(() => {
				if (this._timesEdited) return;
				this.checkInTime.set(checkIn);
				this.checkOutTime.set(checkOut);
			});
		});

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!hotelId) return;
			this.rooms.set([]);
			this._bookings.set([]);
			this._guests.set([]);
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
			// Guests only help to recognise a returning phone: a failure here must not block booking.
			const stopGuests = this._guestsService.listen(
				hotelId,
				(records) => this._guests.set(records),
				(error) => console.error('New booking guests listener failed', error),
			);
			onCleanup(() => {
				stopRooms();
				stopBookings();
				stopGuests();
			});
		});

		// ?room=101&start=2026-10-05&nights=2&guests=3 (from the Calendar, Rooms or a link) preselects the stay once.
		effect(() => {
			const params = this._queryParams();
			if (this._prefilled || !params || !this.ready()) return;
			this._prefilled = true;
			untracked(() => {
				this._prefill(params.get('room'), params.get('start'), params.get('end'), params.get('guests'));
				this._prefillGuest(params.get('guest'));
			});
		});

		effect(() => {
			const guests = this._guests();
			const id = this._pendingGuestId;
			const guest = id ? guests.find((g) => g.id === id) : undefined;
			if (!guest) return;
			this._pendingGuestId = null;
			untracked(() => {
				this.phone.set(guest.phone);
				this.name.set(guest.name);
				this.email.set(guest.email);
			});
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
		if (Number.isInteger(g) && g >= 1) this.adults.set(Math.min(g, 50));
		const room = this.rooms().find((r) => r.number === roomNumber);
		if (room) {
			this.typeFilter.set('all');
			if (this.guests() > room.capacity + room.extraGuests) {
				this.children.set(0);
				this.adults.set(Math.min(this.adults(), room.capacity + room.extraGuests));
			}
			this.roomId.set(room.id);
		}
	}

	/** ?guest=<id> (from Guests → "Нове бронювання") fills the guest in. The list may arrive a moment after the rooms. */
	private _prefillGuest(guestId: string | null): void {
		if (!guestId) return;
		const fill = () => {
			const guest = this._guests().find((g) => g.id === guestId);
			if (!guest) return false;
			this.phone.set(guest.phone);
			this.name.set(guest.name);
			this.email.set(guest.email);
			return true;
		};
		if (fill()) return;
		this._pendingGuestId = guestId;
	}

	protected setTimes(checkIn?: string, checkOut?: string): void {
		this._timesEdited = true;
		if (checkIn !== undefined) this.checkInTime.set(checkIn);
		if (checkOut !== undefined) this.checkOutTime.set(checkOut);
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

	protected stepAdults(delta: number): void {
		this.adults.update((a) => Math.min(50, Math.max(1, a + delta)));
	}

	protected stepChildren(delta: number): void {
		this.children.update((c) => Math.min(50, Math.max(0, c + delta)));
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

	/** `checkInNow` also marks the guest as checked in (desk check-in on the arrival day). */
	protected async submit(checkInNow = false): Promise<void> {
		if (this.saving() || !this.ready()) return;
		const hotelId = this.hotelId()!;
		const room = this.room();
		const name = this.name().trim();
		const phone = this.phone().trim();
		if (!name && !phone) return this.error.set('Вкажіть телефон або ім’я гостя.');
		if (!room) return this.error.set('Оберіть номер: на ці дати вільних номерів немає.');
		if (!TIME.test(this.checkInTime()) || !TIME.test(this.checkOutTime())) return this.error.set('Вкажіть час заїзду та виїзду.');
		if (this.byBed() && !(Number.isInteger(this.bedNumber()) && this.bedNumber() >= 1 && this.bedNumber() <= room.capacity)) {
			return this.error.set(`Місце має бути від 1 до ${room.capacity}.`);
		}
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
			status: this.canChange ? (checkInNow ? 'checkedin' : 'confirmed') : 'pending',
			source: this.source(),
			notes: this.notes().trim(),
			adults: this.adults(),
			children: this.children(),
			checkInTime: this.checkInTime(),
			checkOutTime: this.checkOutTime(),
			...(this.extraPlaces() > 0 ? { extraGuests: this.extraPlaces() } : {}),
			...(this.rate().trim() ? { rate: this.rate().trim() } : {}),
			...(this.byBed() ? { byBed: true, bedNumber: this.bedNumber() } : {}),
			...(this.housekeepingNote().trim() ? { housekeepingNote: this.housekeepingNote().trim() } : {}),
		};
		this.error.set('');
		this.saving.set(true);
		// Link the booking to the guest's profile (found by phone, or created). If that fails the booking is still saved;
		// Guests → "Створити профілі з бронювань" links it later.
		try {
			input.guestId = await this._guestsService.ensure(hotelId, { name: input.guestName, phone: input.phone, email: input.email });
		} catch (error) {
			console.error('Guest lookup failed', error);
		}
		try {
			await this._bookingsService.add(hotelId, input, input.paid > 0 ? { method: this.method(), recorder: this._paymentsService.recorder() } : undefined);
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
		this.adults.set(2);
		this.children.set(0);
		this.byBed.set(false);
		this.bedNumber.set(1);
		this.housekeepingNote.set('');
		this.totalOverride.set(null);
		this.payment.set('none');
		this.error.set('');
		queueMicrotask(() => this._phoneInput()?.nativeElement.focus());
	}
}
