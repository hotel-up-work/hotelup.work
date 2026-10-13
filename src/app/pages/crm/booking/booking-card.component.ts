import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../../layouts/app-shell/app-shell.component';
import {
	BOOKING_MONEY_KEYS,
	BOOKING_TEXT_KEYS,
	BookingPatch,
	BookingRecord,
	BookingsService,
	BookingStatus,
	checkOutPatch,
	holdsRoom,
	isoAddDays,
	STAY_ACTION_LABEL,
	stayActions,
	type StayAction,
} from '../../../feature/firebase/bookings.service';
import { localDay } from '../../../feature/firebase/payments.service';
import { HotelService } from '../../../feature/firebase/hotel.service';
import { RoomRecord, RoomsService } from '../../../feature/firebase/rooms.service';
import { nightsBetween, roomIsFree } from '../../../shared/booking-rules';
import { canCurrent, isLiveSession } from '../../../shared/role';
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
/** Unsaved changes are saved on their own once nothing has been changed for this long. */
const AUTOSAVE_MS = 10_000;
const SAVED_FLASH_MS = 2500;

/** Fields that exist only in the demo; a real booking has nowhere to save them. */
const DEMO_ONLY: ReadonlySet<string> = new Set(COLUMNS.flat().flatMap((section) => section.fields.filter((f) => f.live === false).map((f) => f.key)));

/** Text fields that are saved as typed or picked, with their length limit in `firestore.rules` (default 100). */
const TEXT_KEYS: ReadonlySet<string> = new Set<string>([...BOOKING_TEXT_KEYS, 'rate', 'source', 'phone', 'email', 'notes', 'housekeepingNote']);
const TEXT_LIMIT: Record<string, number> = { phone: 40, contactPhone: 40, email: 200, source: 50, rate: 50, notes: 1000, housekeepingNote: 300 };

const STAMP_AT = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** `Ірина Лисенко · 14 вер. 2026 р., 12:11` */
const staffStamp = (name: string, at: Date | null | undefined) => (at ? `${name} · ${STAMP_AT.format(at)}` : name);
const STATUS_LABEL: Record<BookingStatus, string> = {
	pending: 'Очікує підтвердження',
	confirmed: 'Підтверджено',
	checkedin: 'Проживає',
	checkedout: 'Виїхав',
	cancelled: 'Анульовано',
	waitlist: 'Лист очікування',
};

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
/** `Анна Коваленко` → `{ firstName: 'Анна', lastName: 'Коваленко' }`: stored names are first name first. */
const splitName = (name: string) => {
	const [firstName = '', ...rest] = (name ?? '').trim().split(/\s+/);
	return { firstName, lastName: rest.join(' ') };
};
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
	private _autosave: ReturnType<typeof setTimeout> | null = null;

	protected readonly hotelId = this._hotel.activeHotelId;

	/** The topbar says whose booking this is and where and when; the page itself starts with the fields. */
	protected readonly topTitle = computed(() => `${this.value('firstName').trim()} ${this.value('lastName').trim()}`.trim() || (this.booking() ? 'Гість без імені' : 'Картка бронювання'));
	protected readonly topSubtitle = computed(() => {
		const b = this.booking();
		if (!b) return this._hotel.activeHotel()?.name ?? '';
		return `Номер ${b.roomNumber} · ${shortDate(b.checkIn)} – ${shortDate(b.checkOut)} · ${nightsLabel(this.nights())}`;
	});

	protected readonly money = money;
	protected readonly shortDate = shortDate;
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
	/** Something typed is not saved yet: the Save button is active. */
	protected readonly dirty = computed(() => Object.keys(this._draft()).length > 0);
	protected readonly saving = signal(false);

	// ----- status actions (Поселити / Виселити / В лист очікування / Анулювати), same rules as the calendar -----
	protected readonly statusLabel = STATUS_LABEL;
	protected readonly actionLabel = STAY_ACTION_LABEL;
	protected readonly actions = computed(() => {
		const b = this.booking();
		return b && this.canChange ? stayActions(b.status) : [];
	});
	/** Other desk actions, mirroring the Calendar booking panel. */
	protected readonly canCollect = canCurrent('collectPayment') && this.showFinance;
	protected readonly LATE_CHECKOUT_OPTIONS = [12, 14, 16, 18];
	protected readonly lateOpen = signal(false);
	/** Продовжити проживання: a new check-out date, saved through the card's own check-out rules (room free, price per night kept). */
	protected readonly extendOpen = signal(false);
	protected readonly addDays = isoAddDays;
	protected readonly holdsRoom = holdsRoom;
	/** A late check-out is possible while the room is not taken or blocked from the departure day. */
	protected readonly canExtendStay = computed(() => {
		const b = this.booking();
		if (!b || !this.canChange || !holdsRoom(b.status)) return false;
		const takenAfter = this._others(b).some((x) => x.roomId === b.roomId && holdsRoom(x.status) && x.checkIn === b.checkOut);
		const block = this.room()?.block;
		return !takenAfter && !(block && block.start <= b.checkOut && b.checkOut < block.end);
	});
	/** "Забронювати знову": the new-booking page opens with the same room, dates, guests and guest. */
	protected readonly rebookParams = computed(() => {
		const b = this.booking();
		return b ? { room: b.roomNumber, start: b.checkIn, end: b.checkOut, guests: b.guests, guest: b.guestId ?? null } : {};
	});
	/** Анулювати asks once more before it acts. */
	protected readonly confirmCancel = signal(false);
	protected readonly acting = signal(false);
	protected readonly actionError = signal('');
	protected readonly fieldError = signal<Record<string, string>>({});


	/** Rooms with the ones busy on this booking's dates marked, so a conflict is visible before it is picked. */
	private readonly _roomOptions = computed<Option[]>(() => {
		const b = this.booking();
		if (!b) return [];
		const others = this._bookings().filter((x) => x.id !== b.id);
		return [...this.rooms()]
			.sort((a, c) => a.number.localeCompare(c.number, 'uk', { numeric: true }))
			.map((r) => {
				const busy = holdsRoom(b.status) && r.id !== b.roomId && !roomIsFree(r, others, b.checkIn, b.checkOut);
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

		// Leaving the page saves whatever is still waiting for the autosave pause.
		inject(DestroyRef).onDestroy(() => {
			void this.save();
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
		// Older bookings were made before the creator was recorded; the typed manager is the best guess.
		if (key === 'createdBy') return staffStamp(b.createdBy || b.manager || 'Не записано', b.createdAt);
		if (key === 'checkedInBy') return b.checkedInBy ? staffStamp(b.checkedInBy, b.checkedInAt) : '—';
		if (key === 'checkedOutBy') return b.checkedOutBy ? staffStamp(b.checkedOutBy, b.checkedOutAt) : '—';
		const services = this.demo ? this.demoStore.servicesTotal() : 0;
		if (key === 'services') return money(services);
		const due = b.total + services - b.paid;
		if (key === 'balance') return due > 0 ? `До сплати ${money(due)}` : 'Сплачено повністю';
		return money(key === 'paid' ? b.paid : b.total);
	}

	protected options(field: FieldDef): Option[] {
		if (field.key === 'roomId') return this._roomOptions();
		// The room types the hotel has: a guest may be charged for another category than the room they stay in.
		const values = field.key === 'rateCategory' ? [...new Set(this.rooms().map((r) => r.type))] : (field.options ?? []);
		const list = values.map((value) => ({ value, label: value }));
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
			case 'roomLocked':
				return b.roomLocked ? 'true' : '';
			case 'firstName':
			case 'lastName':
				return splitName(b.guestName)[key];
			default:
				if ((BOOKING_MONEY_KEYS as readonly string[]).includes(key)) return String(stored[key] ?? 0);
				return String(stored[key] ?? '');
		}
	}

	// ----- editing -----

	/** A change from the person: kept as a draft; every change restarts the autosave pause. */
	protected edit(key: string, raw: string): void {
		// Typed back to what is stored: nothing left to save for this field.
		if (raw === this._read(key)) {
			this._dropDraft(key, this._draft()[key] ?? raw);
			this._mark(key, null);
		} else this._draft.update((d) => ({ ...d, [key]: raw }));
		this._clearAutosave();
		if (!this.dirty()) return;
		this._autosave = setTimeout(() => void this.save(), AUTOSAVE_MS);
	}

	/** Saves every draft (the Save button, the autosave pause, or leaving the page). A draft that fails stays, so the button stays active. */
	protected async save(): Promise<void> {
		this._clearAutosave();
		if (this.saving()) return;
		this.saving.set(true);
		try {
			// One by one: a field's rules read the booking as the previous field left it (dates move the total).
			for (const key of Object.keys(this._draft())) await this._flush(key);
		} finally {
			this.saving.set(false);
		}
	}

	private _clearAutosave(): void {
		if (this._autosave) clearTimeout(this._autosave);
		this._autosave = null;
	}

	/** Saves one field's draft. */
	private async _flush(key: string): Promise<void> {
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

	protected async runAction(action: StayAction): Promise<void> {
		const b = this.booking();
		const hotelId = this.hotelId();
		if (!b || this.acting() || (!hotelId && !this.demo)) return;
		if (action === 'cancel' && !this.confirmCancel()) {
			this.confirmCancel.set(true);
			return;
		}
		this.confirmCancel.set(false);
		const patch: BookingPatch =
			action === 'checkout'
				? checkOutPatch(b, localDay(new Date())).patch
				: { status: ({ checkin: 'checkedin', waitlist: 'waitlist', cancel: 'cancelled' } as const)[action] };
		await this._apply(patch, this.actionLabel[action], action === 'checkout');
	}

	/** Підтвердити (pending or off the waitlist): off the waitlist only into a free room, or it would double-book it. */
	protected async confirm(): Promise<void> {
		const b = this.booking();
		if (!b) return;
		const room = this.room();
		if (b.status === 'waitlist' && room && !roomIsFree(room, this._others(b), b.checkIn, b.checkOut)) {
			this.actionError.set(`Номер ${room.number} ще зайнятий на ці дати. Змініть номер або дати, потім підтвердіть.`);
			return;
		}
		await this._apply({ status: 'confirmed' }, 'Підтверджено');
	}

	protected async extendNights(end: string): Promise<void> {
		this.extendOpen.set(false);
		this.edit('checkOut', end);
		await this.save();
		const error = this.fieldError()['checkOut'];
		if (error) this.actionError.set(`Не вдалося продовжити: ${error}`);
	}

	protected async extendStay(hour: number): Promise<void> {
		this.lateOpen.set(false);
		await this._apply({ lateCheckoutHour: hour }, `Пізній виїзд до ${hour}:00`);
	}

	/** Змінити номер: the room is a field of the card, so the button takes the person there. */
	protected focusRoom(): void {
		document.getElementById('f-roomId')?.focus();
	}

	/** Saves a status-like change at once (typed drafts first); a check-out also sends the room to cleaning. */
	private async _apply(patch: BookingPatch, label: string, checkout = false): Promise<void> {
		const b = this.booking();
		const hotelId = this.hotelId();
		if (!b || this.acting() || (!hotelId && !this.demo)) return;
		this.actionError.set('');
		await this.save();
		if (this.dirty()) {
			this.actionError.set('Спершу виправте поля з помилками.');
			return;
		}
		this.acting.set(true);
		try {
			if (this.demo) this.demoStore.update(patch, label);
			else {
				await this._bookingsService.update(hotelId!, b.id, patch);
				// After check-out the room waits for cleaning (a blocked room stays blocked).
				const room = this.room();
				if (checkout && room && room.status !== 'unavailable') {
					await this._roomsService.updateRoom(hotelId!, room.id, { status: 'needs-cleaning' });
				}
			}
		} catch (error) {
			console.error('Booking status change failed', error);
			this.actionError.set('Не вдалося зберегти зміну. Перевірте зʼєднання і спробуйте ще раз.');
		} finally {
			this.acting.set(false);
		}
	}

	protected addNote(event: Event, field: HTMLInputElement): void {
		event.preventDefault();
		this.demoStore.addNote(field.value);
		field.value = '';
	}

	protected warnBeforeLeaving(event: BeforeUnloadEvent): void {
		if (Object.keys(this._draft()).length) event.preventDefault();
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
		this._clearAutosave();
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
				if (holdsRoom(b.status) && !roomIsFree(room, this._others(b), b.checkIn, b.checkOut)) return { error: `Номер ${room.number} зайнятий на ці дати` };
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
			case 'roomLocked':
				return { patch: { roomLocked: raw === 'true' } };
			case 'bedNumber': {
				const n = wholeNumber(raw, 1, 50);
				return n === null ? { error: 'Місце від 1 до 50' } : { patch: { bedNumber: n } };
			}
			// Both halves are stored as one `guestName`; the other half is taken as shown, so two quick edits do not overwrite each other.
			case 'firstName':
			case 'lastName': {
				const first = key === 'firstName' ? text : this.value('firstName').trim();
				const last = key === 'lastName' ? text : this.value('lastName').trim();
				if (!first) return { error: 'Вкажіть імʼя гостя' };
				if (text.length > 100) return { error: 'Не більше 100 символів' };
				return { patch: { guestName: `${first} ${last}`.trim() } };
			}
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
		if (room && holdsRoom(b.status) && !roomIsFree(room, this._others(b), checkIn, checkOut)) return { error: `Номер ${room.number} зайнятий на ці дати` };
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
