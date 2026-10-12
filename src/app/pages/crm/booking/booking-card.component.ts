import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import {
	BOOKING_MONEY_KEYS,
	BOOKING_TEXT_KEYS,
	BookingPatch,
	BookingRecord,
	BookingStatus,
	BookingsService,
	isoAddDays,
} from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { RoomRecord, RoomsService } from '../../feature/firebase/rooms.service';
import { nightsBetween, roomIsFree } from '../../shared/booking-rules';
import { canCurrent, isLiveSession } from '../../shared/role';
import { BookingDemoStore, DEMO_BOOKING_ID } from './booking-card.demo';
import { COLUMNS, FieldDef, NOT_SET, TabId, columnsFor, tabsFor } from './booking-card.fields';
import { BalanceTabComponent } from './tabs/balance-tab.component';
import { ChargesTabComponent } from './tabs/charges-tab.component';
import { DocumentTabComponent } from './tabs/document-tab.component';
import { GuestsTabComponent } from './tabs/guests-tab.component';
import { RecordsTabComponent } from './tabs/records-tab.component';
import { TasksTabComponent } from './tabs/tasks-tab.component';

type SaveState = 'saving' | 'saved' | 'error';
type Plan = { patch: BookingPatch } | { error: string };

interface Option {
	value: string;
	label: string;
	disabled?: boolean;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 90;
const MAX_TOTAL = 10_000_000;
const MAX_MONEY = 100_000_000;
/** Typing pauses this long before the field is saved; leaving the field saves at once. */
const TYPING_DELAY_MS = 700;
const SAVED_FLASH_MS = 2500;

/** Fields that exist only in the demo; a real booking has nowhere to save them. */
const DEMO_ONLY: ReadonlySet<string> = new Set(COLUMNS.flat().flatMap((section) => section.fields.filter((f) => f.live === false).map((f) => f.key)));

/** Text fields that are saved as typed or picked, with their length limit in `firestore.rules` (default 100). */
const TEXT_KEYS: ReadonlySet<string> = new Set<string>([...BOOKING_TEXT_KEYS, 'rate', 'source', 'phone', 'email', 'notes', 'housekeepingNote']);
const TEXT_LIMIT: Record<string, number> = { phone: 40, email: 200, source: 50, rate: 50, notes: 1000, housekeepingNote: 300 };

const STATUS_LABEL: Record<BookingStatus, string> = {
	pending: 'Очікує підтвердження',
	confirmed: 'Підтверджено',
	checkedin: 'Заїхав',
	checkedout: 'Виїхав',
	cancelled: 'Скасовано',
};

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const shortDate = (iso: string) => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));

/** Ukrainian plural: 1 ніч, 2 ночі, 5 ночей. */
function nightsLabel(n: number): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return `${n} ${mod10 === 1 && mod100 !== 11 ? 'ніч' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'ночі' : 'ночей'}`;
}

/** `raw` as a whole number between `min` and `max`, or null. */
function wholeNumber(raw: string, min: number, max: number): number | null {
	const text = raw.trim();
	const n = Number(text);
	return text !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** An empty money field counts as zero. */
function amount(raw: string, max: number): number | null {
	const text = raw.trim().replace(',', '.');
	const n = text === '' ? 0 : Number(text);
	return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
}

/**
 * One booking as an editable card. Real hotels: `hotels/{hotelId}/bookings/{id}`, opened with `?id=`, only
 * fields that are saved. Demo: one seeded booking in memory (`BookingDemoStore`) with every field and tab.
 * Every field saves on its own: text after a typing pause or on leaving the field, lists, dates and
 * switches at once. A change that breaks a rule (room busy, over capacity, paid above total) is not
 * sent; the field shows why and keeps what was typed. Money received is never typed here: `paid`
 * follows the payment journal. Fields and tabs without data behind them yet are hidden from real hotels.
 */
@Component({
	selector: 'app-booking-card',
	imports: [AppShellComponent, RouterLink, GuestsTabComponent, ChargesTabComponent, BalanceTabComponent, TasksTabComponent, DocumentTabComponent, RecordsTabComponent],
	providers: [BookingDemoStore],
	templateUrl: './booking-card.component.html',
	styleUrl: './booking-card.component.scss',
	host: { '(window:beforeunload)': 'warnBeforeLeaving($event)' },
})
export class BookingCardComponent {
	/** The demo has no Firestore: the card runs on seeded data kept in memory. */
	protected readonly demo = !isLiveSession();
	protected readonly demoStore = inject(BookingDemoStore);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _roomsService = inject(RoomsService);
	private readonly _hotel = inject(HotelService);
	private readonly _route = inject(ActivatedRoute);
	private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();

	protected readonly hotelId = this._hotel.activeHotelId;

	/** The topbar says whose booking this is and where and when; the page itself starts with the fields. */
	protected readonly topTitle = computed(() => this.value('guestName') || (this.booking() ? 'Гість без імені' : 'Картка бронювання'));
	protected readonly topSubtitle = computed(() => {
		const b = this.booking();
		if (!b) return this._hotel.activeHotel()?.name ?? '';
		return `Номер ${b.roomNumber} · ${shortDate(b.checkIn)} – ${shortDate(b.checkOut)} · ${nightsLabel(this.nights())}`;
	});

	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly statusLabel = STATUS_LABEL;
	protected readonly canChange = canCurrent('changeBooking');
	/** Money figures only for roles that see guest bills. */
	protected readonly showFinance = canCurrent('guestBill');
	protected readonly columns = columnsFor(this.demo, this.showFinance);
	protected readonly tabs = tabsFor(this.demo, this.showFinance);
	protected readonly activeTab = signal<TabId>('card');
	protected readonly canPay = canCurrent('collectPayment');
	protected readonly historyDesc = computed(() => [...this.demoStore.history()].reverse());
	protected readonly created = computed(() => {
		const at = this.booking()?.createdAt;
		return at ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'long', timeStyle: 'short' }).format(at) : '';
	});

	private readonly _queryParams = toSignal(this._route.queryParamMap);
	protected readonly bookingId = computed(() => (this.demo ? DEMO_BOOKING_ID : (this._queryParams()?.get('id') ?? '')));

	protected readonly rooms = signal<RoomRecord[]>([]);
	private readonly _bookings = signal<BookingRecord[]>([]);
	private readonly _roomsLoaded = signal(false);
	private readonly _bookingsLoaded = signal(false);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());

	protected readonly booking = computed(() => this._bookings().find((b) => b.id === this.bookingId()) ?? null);
	protected readonly nights = computed(() => {
		const b = this.booking();
		return b ? nightsBetween(b.checkIn, b.checkOut) : 0;
	});
	protected readonly room = computed(() => this.rooms().find((r) => r.id === this.booking()?.roomId) ?? null);
	/** A cancelled booking is a record, not a working document. */
	protected readonly readOnly = computed(() => !this.canChange || this.booking()?.status === 'cancelled');

	/** What was typed and is not saved yet, by field. A field with a draft shows the draft, not the stored value. */
	private readonly _draft = signal<Record<string, string>>({});
	protected readonly saveState = signal<Record<string, SaveState>>({});
	protected readonly fieldError = signal<Record<string, string>>({});

	/** One line for the page header: all saved, still saving, or something needs attention. */
	protected readonly summary = computed(() => {
		const states = Object.values(this.saveState());
		if (states.includes('error')) return { kind: 'error', text: 'Не всі зміни збережено' };
		if (states.includes('saving')) return { kind: 'saving', text: 'Зберігаємо…' };
		if (Object.keys(this._draft()).length) return { kind: 'saving', text: 'Є незбережені зміни' };
		return { kind: 'saved', text: 'Усі зміни збережено' };
	});

	/** Rooms with the ones busy on this booking's dates marked, so a conflict is visible before it is picked. */
	private readonly _roomOptions = computed<Option[]>(() => {
		const b = this.booking();
		if (!b) return [];
		const others = this._bookings().filter((x) => x.id !== b.id);
		return [...this.rooms()]
			.sort((a, c) => a.number.localeCompare(c.number, 'uk', { numeric: true }))
			.map((r) => {
				const busy = r.id !== b.roomId && !roomIsFree(r, others, b.checkIn, b.checkOut);
				return { value: r.id, label: `${r.number} · ${r.type}${busy ? ' (зайнято)' : ''}`, disabled: busy };
			});
	});

	constructor() {
		effect(() => {
			if (!this.demo) return;
			this.rooms.set(this.demoStore.rooms());
			this._bookings.set(this.demoStore.bookings());
			this._roomsLoaded.set(true);
			this._bookingsLoaded.set(true);
		});

		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (this.demo || !hotelId) return;
			this.rooms.set([]);
			this._bookings.set([]);
			this._roomsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			const onError = (error: Error) => {
				console.error('Booking card listener failed', error);
				this.loadError.set('Не вдалося завантажити бронювання. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
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

		// Another booking opened in the same page: nothing typed for the previous one carries over.
		effect(() => {
			this.bookingId();
			untracked(() => this._reset());
		});

		// Leaving the page saves whatever is still waiting for the typing pause.
		inject(DestroyRef).onDestroy(() => {
			for (const key of Object.keys(this._draft())) void this.flush(key);
			for (const timer of this._timers.values()) clearTimeout(timer);
		});
	}

	// ----- reading -----

	/** The value a field shows: the draft while there is one, otherwise what is stored. */
	protected value(key: string): string {
		const draft = this._draft()[key];
		return draft !== undefined ? draft : this._read(key);
	}

	/** Read-only figures (total, paid, balance). */
	protected display(key: string): string {
		const b = this.booking();
		if (!b) return '';
		const services = this.demo ? this.demoStore.servicesTotal() : 0;
		if (key === 'services') return money(services);
		const due = b.total + services - b.paid;
		if (key === 'balance') return due > 0 ? `До сплати ${money(due)}` : 'Сплачено повністю';
		return money(key === 'paid' ? b.paid : b.total);
	}

	protected options(field: FieldDef): Option[] {
		if (field.key === 'roomId') return this._roomOptions();
		const list = (field.options ?? []).map((value) => ({ value, label: value }));
		const current = this.value(field.key);
		const known = current === NOT_SET || list.some((o) => o.value === current);
		return [{ value: NOT_SET, label: 'Не визначено' }, ...list, ...(known ? [] : [{ value: current, label: current }])];
	}

	protected isOff(field: FieldDef): boolean {
		if (this.readOnly()) return true;
		return field.key === 'bedNumber' && this.value('byBed') !== 'true';
	}

	private _read(key: string, b: BookingRecord | null = this.booking()): string {
		if (!b) return '';
		if (this.demo && DEMO_ONLY.has(key)) return this.demoStore.extras()[key] ?? '';
		const stored = b as unknown as Record<string, unknown>;
		switch (key) {
			case 'nights':
				return String(nightsBetween(b.checkIn, b.checkOut));
			case 'price': {
				const n = nightsBetween(b.checkIn, b.checkOut);
				return n > 0 ? String(Math.round((b.total / n) * 100) / 100) : '0';
			}
			case 'adults':
				return String(b.adults ?? b.guests);
			case 'children':
				return String(b.children ?? 0);
			case 'childrenPaid':
				return String(b.childrenPaid ?? 0);
			case 'extraGuests':
				return String(b.extraGuests ?? 0);
			case 'bedNumber':
				return String(b.bedNumber ?? 1);
			case 'byBed':
				return b.byBed ? 'true' : '';
			default:
				if ((BOOKING_MONEY_KEYS as readonly string[]).includes(key)) return String(stored[key] ?? 0);
				return String(stored[key] ?? '');
		}
	}

	// ----- editing -----

	/** A change from the person: remember it, then save after a typing pause (`delay` 0 saves at once). */
	protected edit(key: string, raw: string, delay: number): void {
		this._draft.update((d) => ({ ...d, [key]: raw }));
		this._clearTimer(key);
		if (delay <= 0) {
			void this.flush(key);
			return;
		}
		this._timers.set(
			key,
			setTimeout(() => void this.flush(key), delay),
		);
	}

	protected readonly typingDelay = TYPING_DELAY_MS;

	/** Saves the field's draft now (leaving the field, or the typing pause ended). */
	protected async flush(key: string): Promise<void> {
		this._clearTimer(key);
		const raw = this._draft()[key];
		const booking = this.booking();
		const hotelId = this.hotelId();
		if (raw === undefined || !booking || (!hotelId && !this.demo) || this.readOnly()) return;

		if (raw === this._read(key)) {
			this._dropDraft(key, raw);
			this._mark(key, null);
			return;
		}
		if (this.demo && DEMO_ONLY.has(key)) {
			const text = raw.trim();
			if (text.length > 100) {
				this._mark(key, 'error', 'Не більше 100 символів');
				return;
			}
			this.demoStore.setExtra(key, text);
			this.demoStore.log(`Змінено: ${this._label(key)}`);
			this._dropDraft(key, raw);
			this._flashSaved(key);
			return;
		}
		const plan = this._plan(key, raw, booking);
		if ('error' in plan) {
			this._mark(key, 'error', plan.error);
			return;
		}
		this._mark(key, 'saving');
		try {
			if (this.demo) this.demoStore.update(plan.patch, this._label(key));
			else await this._bookingsService.update(hotelId!, booking.id, plan.patch);
			this._dropDraft(key, raw);
			this._flashSaved(key);
		} catch (error) {
			console.error('Booking autosave failed', error);
			this._mark(key, 'error', 'Не вдалося зберегти. Перевірте зʼєднання і спробуйте ще раз.');
		}
	}

	private _flashSaved(key: string): void {
		this._mark(key, 'saved');
		this._timers.set(
			key,
			setTimeout(() => {
				this._timers.delete(key);
				if (this.saveState()[key] === 'saved') this._mark(key, null);
			}, SAVED_FLASH_MS),
		);
	}

	private _label(key: string): string {
		return COLUMNS.flat().flatMap((section) => section.fields).find((f) => f.key === key)?.label ?? key;
	}

	protected addNote(event: Event, field: HTMLTextAreaElement): void {
		event.preventDefault();
		this.demoStore.addNote(field.value);
		field.value = '';
	}

	protected warnBeforeLeaving(event: BeforeUnloadEvent): void {
		if (Object.keys(this._draft()).length) event.preventDefault();
	}

	private _clearTimer(key: string): void {
		const timer = this._timers.get(key);
		if (timer) clearTimeout(timer);
		this._timers.delete(key);
	}

	private _dropDraft(key: string, raw: string): void {
		this._draft.update((d) => {
			if (d[key] !== raw) return d;
			const { [key]: _gone, ...rest } = d;
			return rest;
		});
	}

	private _mark(key: string, state: SaveState | null, error = ''): void {
		this.saveState.update((s) => {
			const { [key]: _gone, ...rest } = s;
			return state ? { ...rest, [key]: state } : rest;
		});
		this.fieldError.update((e) => {
			const { [key]: _gone, ...rest } = e;
			return error ? { ...rest, [key]: error } : rest;
		});
	}

	private _reset(): void {
		for (const timer of this._timers.values()) clearTimeout(timer);
		this._timers.clear();
		this._draft.set({});
		this.saveState.set({});
		this.fieldError.set({});
	}

	// ----- rules -----

	/** Turns what was typed into the patch to send, or says why it cannot be saved. */
	private _plan(key: string, raw: string, b: BookingRecord): Plan {
		const text = raw.trim();
		switch (key) {
			case 'checkIn':
				if (!DAY.test(text)) return { error: 'Вкажіть дату заїзду' };
				// Moving the arrival moves the stay: the number of nights stays.
				return this._stay(b, text, isoAddDays(text, nightsBetween(b.checkIn, b.checkOut)));
			case 'checkOut':
				if (!DAY.test(text)) return { error: 'Вкажіть дату виїзду' };
				if (text <= b.checkIn) return { error: 'Виїзд має бути пізніше за заїзд' };
				if (nightsBetween(b.checkIn, text) > MAX_NIGHTS) return { error: `Не більше ${MAX_NIGHTS} ночей` };
				return this._stay(b, b.checkIn, text);
			case 'nights': {
				const n = wholeNumber(raw, 1, MAX_NIGHTS);
				return n === null ? { error: `Від 1 до ${MAX_NIGHTS} ночей` } : this._stay(b, b.checkIn, isoAddDays(b.checkIn, n));
			}
			case 'checkInTime':
			case 'checkOutTime':
				return TIME.test(text) ? { patch: { [key]: text } } : { error: 'Вкажіть час, наприклад 14:00' };
			case 'roomId': {
				const room = this.rooms().find((r) => r.id === text);
				if (!room) return { error: 'Оберіть номер зі списку' };
				const tooMany = this._capacity(room, b.guests);
				if (tooMany) return { error: tooMany };
				if (!roomIsFree(room, this._others(b), b.checkIn, b.checkOut)) return { error: `Номер ${room.number} зайнятий на ці дати` };
				return { patch: { roomId: room.id, roomNumber: room.number } };
			}
			case 'adults':
			case 'children': {
				const adults = key === 'adults' ? wholeNumber(raw, 1, 50) : (b.adults ?? b.guests);
				const children = key === 'children' ? wholeNumber(raw, 0, 50) : (b.children ?? 0);
				if (adults === null || children === null) return { error: key === 'adults' ? 'Хоча б один дорослий, не більше 50' : 'Від 0 до 50' };
				const tooMany = this.room() && this._capacity(this.room()!, adults + children);
				if (tooMany) return { error: tooMany };
				const patch: BookingPatch = { adults, children, guests: adults + children };
				if ((b.childrenPaid ?? 0) > children) patch.childrenPaid = children;
				return { patch };
			}
			case 'childrenPaid': {
				const n = wholeNumber(raw, 0, b.children ?? 0);
				return n === null ? { error: `Від 0 до ${b.children ?? 0}: не більше, ніж дітей` } : { patch: { childrenPaid: n } };
			}
			case 'extraGuests': {
				const n = wholeNumber(raw, 0, 20);
				return n === null ? { error: 'Від 0 до 20' } : { patch: { extraGuests: n } };
			}
			case 'byBed':
				return { patch: { byBed: raw === 'true' } };
			case 'bedNumber': {
				const n = wholeNumber(raw, 1, 50);
				return n === null ? { error: 'Місце від 1 до 50' } : { patch: { bedNumber: n } };
			}
			case 'guestName':
				if (!text) return { error: 'Вкажіть імʼя гостя' };
				return text.length > 200 ? { error: 'Не більше 200 символів' } : { patch: { guestName: text } };
			case 'price': {
				const price = amount(raw, MAX_MONEY);
				const n = nightsBetween(b.checkIn, b.checkOut);
				if (price === null) return { error: 'Вкажіть суму: число від 0' };
				const total = Math.round(price * n);
				if (total > MAX_TOTAL) return { error: 'Сума проживання завелика' };
				if (total < b.paid) return { error: `Сума не може бути меншою за оплачену (${money(b.paid)})` };
				return { patch: { total } };
			}
			case 'email':
				if (text && !/^\S+@\S+\.\S+$/.test(text)) return { error: 'Перевірте адресу пошти' };
				break;
		}
		if ((BOOKING_MONEY_KEYS as readonly string[]).includes(key)) {
			const n = amount(raw, MAX_MONEY);
			return n === null ? { error: 'Вкажіть суму: число від 0' } : { patch: { [key]: n } };
		}
		if (TEXT_KEYS.has(key)) {
			const limit = TEXT_LIMIT[key] ?? 100;
			return text.length > limit ? { error: `Не більше ${limit} символів` } : { patch: { [key]: text } };
		}
		return { error: 'Це поле поки не зберігається' };
	}

	/** New dates for the stay; the room must be free and the total follows the nights at the same price per night. */
	private _stay(b: BookingRecord, checkIn: string, checkOut: string): Plan {
		const room = this.room();
		if (room && !roomIsFree(room, this._others(b), checkIn, checkOut)) return { error: `Номер ${room.number} зайнятий на ці дати` };
		const was = nightsBetween(b.checkIn, b.checkOut);
		const now = nightsBetween(checkIn, checkOut);
		const total = was > 0 ? Math.round((b.total / was) * now) : b.total;
		if (total > MAX_TOTAL) return { error: 'Сума проживання завелика' };
		if (total < b.paid) return { error: `Нова сума (${money(total)}) менша за оплачену (${money(b.paid)})` };
		return { patch: { checkIn, checkOut, ...(total !== b.total ? { total } : {}) } };
	}

	private _others(b: BookingRecord): BookingRecord[] {
		return this._bookings().filter((x) => x.id !== b.id);
	}

	/** Error text when `guests` do not fit the room, otherwise ''. */
	private _capacity(room: RoomRecord, guests: number): string {
		const max = room.capacity + room.extraGuests;
		return guests > max ? `У номері ${room.number} не більше ${max} гостей` : '';
	}
}
