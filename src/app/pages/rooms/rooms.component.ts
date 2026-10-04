import { Component, DestroyRef, computed, effect, inject, signal, type Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ModalService, type Modal } from '@wawjs/ngx-ui';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingRecord, BookingsService } from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { RoomPatch, RoomRecord, RoomsService } from '../../feature/firebase/rooms.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { getStoredPlan, limitRoomsToPlan, PLAN_ROOM_LIMIT } from '../../shared/plan';
import { canCurrent, getSessionRole, isLiveSession } from '../../shared/role';
import { BlockRoomComponent } from './dialogs/block-room.component';
import { ConfirmComponent } from './dialogs/confirm.component';
import { RoomFormComponent } from './dialogs/room-form.component';
import { RoomStatusComponent } from './dialogs/room-status.component';
import { RoomTypesComponent } from './dialogs/room-types.component';
import type { Room, RoomBlock, RoomFormValue, RoomStatus, RoomType, RoomTypeFormValue, RoomTypeSummary } from './rooms.interface';

type Segment = 'all' | 'ready' | 'occupied' | 'cleaning' | 'unavailable';
type ViewMode = 'cards' | 'list';

const DEMO_TYPES: RoomType[] = [
	{
		id: 'standard',
		name: 'Стандарт',
		description: '',
		price: 1200,
		capacity: 2,
		beds: '1 двоспальне ліжко',
		area: 22,
		amenities: ['Wi-Fi', 'Кондиціонер', 'Телевізор', 'Душ'],
	},
	{
		id: 'superior',
		name: 'Покращений',
		description: '',
		price: 1500,
		capacity: 3,
		beds: '1 двоспальне + диван',
		area: 26,
		amenities: ['Wi-Fi', 'Кондиціонер', 'Телевізор', 'Душ', 'Балкон'],
	},
	{
		id: 'lux',
		name: 'Люкс',
		description: '',
		price: 1600,
		capacity: 2,
		beds: '1 двоспальне ліжко',
		area: 30,
		amenities: ['Wi-Fi', 'Кондиціонер', 'Телевізор', 'Фен', 'Мінібар', 'Сніданок'],
	},
	{
		id: 'apartment',
		name: 'Апартаменти',
		description: '',
		price: 2200,
		capacity: 4,
		beds: '2 спальні + диван',
		area: 45,
		amenities: ['Wi-Fi', 'Кондиціонер', 'Телевізор', 'Кухня', 'Пральна машина'],
	},
];
const GUEST_NAMES = [
	'Олег Бондар',
	'Марія Петренко',
	'Ірина Шевченко',
	'Дмитро Левченко',
	'Наталія Коваль',
	'Максим Ткаченко',
	'Андрій Мельник',
	'Тарас Гончар',
	'Юлія Савчук',
	'Віктор Коваль',
];
const ALL_STATUSES: RoomStatus[] = ['ready', 'occupied', 'needs-cleaning', 'cleaning', 'unavailable'];
const DEMO_TODAY = '2026-09-17';

function buildRooms(): Room[] {
	const list: Room[] = [];
	let gi = 0;
	const push = (number: string, type: string, floor: number) => {
		const base = DEMO_TYPES.find((t) => t.name === type)!;
		list.push({
			id: number,
			number,
			type,
			floor,
			capacity: base.capacity,
			beds: base.beds,
			area: base.area,
			price: base.price,
			amenities: base.amenities,
			status: 'occupied',
			guest: GUEST_NAMES[gi++ % GUEST_NAMES.length],
			checkout: '20 вересня',
			maintenanceNotes: [],
		});
	};
	for (let i = 101; i <= 110; i++) push(String(i), 'Стандарт', 1);
	for (let i = 111; i <= 114; i++) push(String(i), 'Покращений', 1);
	for (let i = 201; i <= 208; i++) push(String(i), 'Люкс', 2);
	for (let i = 301; i <= 306; i++) push(String(i), 'Апартаменти', 3);

	const set = (num: string, overrides: Partial<Room>) => Object.assign(list.find((r) => r.number === num)!, overrides);
	set('204', {
		status: 'occupied',
		needsCleaning: true,
		guest: 'Анна Коваленко',
		checkin: '17 вересня',
		checkout: '20 вересня',
		nights: 3,
		payment: 'Оплачено',
		nextGuest: 'Олег Бондар',
		nextStart: '21 вересня',
		nextEnd: '23 вересня',
		nextArrival: '14:30',
		maintenanceNotes: [
			{ date: '12 вересня', text: 'Потрібно замінити лампу біля ліжка.', status: 'Виконано' },
			{ date: '2 серпня', text: 'Перевірити кондиціонер.', status: 'Виконано' },
		],
	});
	set('103', { status: 'ready', guest: null, nextGuest: null, nextArrival: '21 вересня', lastCleaned: '17 вересня · 11:40', cleanedBy: 'Марія' });
	set('205', { status: 'ready', guest: null, nextArrival: null, lastCleaned: '16 вересня · 10:20', cleanedBy: 'Оксана' });
	set('207', { status: 'needs-cleaning', guest: null, checkoutTime: '11:08', assigned: null });
	set('302', { status: 'needs-cleaning', guest: null, checkoutTime: '10:40', assigned: null });
	set('206', { status: 'cleaning', guest: null, assigned: 'Марія', startedAt: '12:20', nextArrival: '13:30' });
	set('301', { status: 'unavailable', guest: null, reason: 'Ремонт', blockStart: '2026-09-17', blockEnd: '2026-09-19' });
	return list;
}

/** `YYYY-MM-DD` in the browser's time zone. */
function localDate(date: Date): string {
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const DAY_MONTH = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });

/** "17 вересня" for an ISO date; other strings are returned as they are. */
function dayMonth(value: string | undefined): string {
	if (!value) return '-';
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? DAY_MONTH.format(new Date(value + 'T00:00')) : value;
}

const paymentLabel = (b: BookingRecord) => (b.paid <= 0 ? 'Не оплачено' : b.paid < b.total ? 'Частково оплачено' : 'Оплачено');

/** A booking that still holds its room: waiting, or the guest is in the house (even past the planned check-out). */
const holdsRoom = (b: BookingRecord, today: string) =>
	b.status === 'checkedin' || ((b.status === 'confirmed' || b.status === 'pending') && b.checkOut > today);

/**
 * Real hotels: the room list as stored plus what the bookings say. A room is occupied while a guest is
 * checked in (CRM.md → Shared operational definitions); a technical block always wins, and a leftover
 * hand-set "occupied" without a stay shows as ready. The next arrival is the earliest waiting booking.
 */
function withStays(records: RoomRecord[], bookings: BookingRecord[], today: string): Room[] {
	return records.map((record) => {
		const room = toRoom(record);
		if (record.status === 'unavailable') return room;
		const mine = bookings.filter((b) => b.roomId === record.id && holdsRoom(b, today));
		const current = mine.find((b) => b.status === 'checkedin');
		const next = mine.filter((b) => b !== current).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
		if (next) Object.assign(room, { nextGuest: next.guestName, nextStart: dayMonth(next.checkIn), nextEnd: dayMonth(next.checkOut), nextArrival: dayMonth(next.checkIn) });
		if (current) {
			Object.assign(room, {
				status: 'occupied',
				guest: current.guestName,
				checkin: dayMonth(current.checkIn),
				checkout: dayMonth(current.checkOut),
				nights: Math.round((Date.parse(current.checkOut) - Date.parse(current.checkIn)) / 86_400_000),
				payment: paymentLabel(current),
			});
		} else if (record.status === 'occupied') {
			room.status = 'ready';
		}
		return room;
	});
}

function toRoom(r: RoomRecord): Room {
	return {
		id: r.id,
		number: r.number,
		type: r.type,
		floor: r.floor,
		capacity: r.capacity,
		beds: r.beds,
		area: r.area,
		price: r.price,
		amenities: r.amenities,
		status: r.status,
		guest: null,
		maintenanceNotes: [],
		lastCleaned: r.lastCleanedAt ? `${DAY_MONTH.format(r.lastCleanedAt)} · ${r.lastCleanedAt.toTimeString().slice(0, 5)}` : undefined,
		reason: r.block?.reason,
		blockStart: r.block?.start,
		blockEnd: r.block?.end,
		blockNote: r.block?.note,
	};
}

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const capBucket = (cap: number) => (cap >= 4 ? '4' : cap >= 3 ? '3' : String(cap));
const needsCleaning = (r: Room) => Boolean(r.needsCleaning) || r.status === 'needs-cleaning' || r.status === 'cleaning';
const statusLabel = (s: RoomStatus | string) =>
	({ occupied: 'Зайнятий', ready: 'Готовий', 'needs-cleaning': 'Потребує прибирання', cleaning: 'Прибирається', unavailable: 'Недоступний' })[
		s as RoomStatus
	] ?? s;
const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase('uk-UA') === b.trim().toLocaleLowerCase('uk-UA');

@Component({
	selector: 'app-rooms',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss',
})
export class RoomsComponent {
	private readonly _roomsService = inject(RoomsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _router = inject(Router);
	private readonly _hotel = inject(HotelService);
	private readonly _modal = inject(ModalService);
	/** ngx-ui modals opened by this page; closed when the page is left. */
	private readonly _modals = new Set<Modal>();

	/** Real account: the active hotel's rooms from Firestore; booking-based parts are hidden until bookings exist. */
	protected readonly live = isLiveSession();
	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return "Grand Hotel · Кам'янець-Подільський";
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly showGuestAndFinance = getSessionRole() !== 'maintenance';
	protected readonly canEditInventory = canCurrent('editInventory');
	protected readonly canBlockRoom = canCurrent('blockRoom');
	protected readonly blockRequested = signal<Record<string, boolean>>({});

	protected requestBlock(number: string): void {
		this.blockRequested.update((m) => ({ ...m, [number]: true }));
		this.toast(`Номер ${number}: запит на блокування надіслано менеджеру`);
	}

	protected readonly money = money;
	protected readonly statusLabel = statusLabel;
	protected readonly dayMonth = dayMonth;
	protected readonly Math = Math;
	protected readonly today = this.live ? localDate(new Date()) : DEMO_TODAY;

	protected readonly rooms = signal<Room[]>(this.live ? [] : limitRoomsToPlan(buildRooms()));
	/** Real hotels: rooms as stored and the hotel's bookings; `rooms` is these two combined (withStays). */
	private readonly _storedRooms = signal<RoomRecord[]>([]);
	private readonly _bookings = signal<BookingRecord[]>([]);
	protected readonly types = signal<RoomType[]>(this.live ? [] : DEMO_TYPES);
	protected readonly loading = signal(this.live);
	protected readonly loadError = signal('');
	/** Plan limits apply to the demo plan picker only; real hotels have no plan yet (CRM.md → Plans). */
	protected readonly roomLimit = this.live ? null : PLAN_ROOM_LIMIT[getStoredPlan()];
	protected readonly roomLimitReached = computed(() => this.roomLimit !== null && this.rooms().length >= this.roomLimit);
	protected readonly search = signal('');
	protected readonly segment = signal<Segment>('all');
	protected readonly viewMode = signal<ViewMode>('cards');

	/** Room types in display order, plus any type name a room still uses after its type was removed. */
	protected readonly typeNames = computed(() => {
		const names = this.types().map((t) => t.name);
		for (const r of this.rooms()) if (!names.includes(r.type)) names.push(r.type);
		return names;
	});
	protected readonly typeSummary = computed<RoomTypeSummary[]>(() =>
		this.types().map((t) => {
			const rooms = this.rooms().filter((r) => r.type === t.name);
			return { ...t, count: rooms.length, minPrice: rooms.length ? Math.min(...rooms.map((r) => r.price)) : t.price };
		}),
	);

	protected readonly hiddenTypes = signal(new Set<string>());
	protected readonly statusFilter = signal(new Set<RoomStatus>(ALL_STATUSES));
	protected readonly cleaningOnlyFilter = signal(false);
	protected readonly capacityFilter = signal(new Set(['1', '2', '3', '4']));
	protected readonly filtersOpen = signal(false);

	protected readonly selectedRoomNumber = signal<string | null>(null);
	protected readonly saving = signal(false);
	protected readonly toastMessage = signal('');
	protected readonly aiAnswerKey = signal<string | null>(null);
	/** Writes are possible: always in the demo; for a real hotel once the inventory has loaded. */
	protected readonly ready = computed(() => !this.live || (!!this.hotelId() && !this.loading() && !this.loadError()));

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly counts = computed(() => {
		const rooms = this.rooms();
		const total = rooms.length;
		const occupied = rooms.filter((r) => r.status === 'occupied').length;
		const ready = rooms.filter((r) => r.status === 'ready').length;
		const cleaningKpi = rooms.filter((r) => r.status === 'needs-cleaning' || r.status === 'cleaning').length;
		const unavailable = rooms.filter((r) => r.status === 'unavailable').length;
		return { total, occupied, ready, cleaningKpi, unavailable };
	});

	private passesFilters(r: Room): boolean {
		if (this.cleaningOnlyFilter() && !needsCleaning(r)) return false;
		if (this.hiddenTypes().has(r.type)) return false;
		if (!this.statusFilter().has(r.status)) return false;
		if (!this.capacityFilter().has(capBucket(r.capacity))) return false;
		return true;
	}

	protected readonly filteredRooms = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		let list = this.rooms().filter((r) => this.passesFilters(r));
		if (q) list = list.filter((r) => (r.number + ' ' + r.type).toLocaleLowerCase('uk-UA').includes(q));
		const seg = this.segment();
		if (seg === 'ready') list = list.filter((r) => r.status === 'ready');
		else if (seg === 'occupied') list = list.filter((r) => r.status === 'occupied');
		else if (seg === 'cleaning') list = list.filter((r) => r.status === 'needs-cleaning' || r.status === 'cleaning');
		else if (seg === 'unavailable') list = list.filter((r) => r.status === 'unavailable');
		return list;
	});

	protected readonly typeGroups = computed(() => {
		const list = this.filteredRooms();
		return this.typeNames()
			.map((type) => ({ type, rooms: list.filter((r) => r.type === type) }))
			.filter((g) => g.rooms.length > 0);
	});

	protected readonly selectedRoom = computed(() => {
		const number = this.selectedRoomNumber();
		return number ? this.rooms().find((r) => r.number === number) : undefined;
	});

	protected readonly aiAnswerHtml = computed(() => {
		const key = this.aiAnswerKey();
		if (!key) return '';
		const rooms = this.rooms();
		const free = rooms.filter((r) => r.status === 'ready').map((r) => r.number);
		const toClean = rooms.filter((r) => r.status === 'needs-cleaning' || r.status === 'cleaning').map((r) => r.number);
		const blocked = rooms.filter((r) => r.status === 'unavailable');
		const map: Record<string, string> = {
			freeToday: free.length ? `Сьогодні вільні номери: <b>${free.join(', ')}</b>.` : 'Наразі всі номери зайняті.',
			toClean: toClean.length ? `Потрібно прибрати: <b>${toClean.join(', ')}</b>.` : 'Усі номери прибрані.',
			freeWeekend: `За поточним графіком на вихідні орієнтовно вільні: <b>${free.join(', ') || '-'}</b> (залежно від бронювань).`,
			popular: `Найчастіше бронюють номери категорії <b>Люкс</b>, за даними останніх місяців.`,
			blocked: blocked.length
				? blocked.map((r) => `Номер <b>${r.number}</b>: ${r.reason} (${dayMonth(r.blockStart)}–${dayMonth(r.blockEnd)})`).join('<br>')
				: 'Заблокованих номерів немає.',
		};
		return map[key] ?? 'AI відповідає лише на основі даних номерного фонду.';
	});

	/** Label in the modal header. */
	private readonly _dialogLabel = this.live ? 'НОМЕРИ' : 'ДЕМО';

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			for (const modal of this._modals) modal.close?.();
		});

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			if (!this.live) return;
			const hotelId = this.hotelId();
			this._storedRooms.set([]);
			this._bookings.set([]);
			this.types.set([]);
			this.selectedRoomNumber.set(null);
			this.loadError.set('');
			if (!hotelId) {
				this.loading.set(false);
				return;
			}
			this.loading.set(true);
			let roomsLoaded = false;
			let bookingsLoaded = false;
			const loaded = () => this.loading.set(!(roomsLoaded && bookingsLoaded));
			const onError = (error: Error) => {
				console.error('Rooms listener failed', error);
				this.loading.set(false);
				this.loadError.set('Не вдалося завантажити номери. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopRooms = this._roomsService.listenRooms(
				hotelId,
				(rooms) => {
					roomsLoaded = true;
					this._storedRooms.set(rooms);
					loaded();
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(bookings) => {
					bookingsLoaded = true;
					this._bookings.set(bookings);
					loaded();
				},
				onError,
			);
			const stopTypes = this._roomsService.listenTypes(hotelId, (types) => this.types.set(types), onError);
			onCleanup(() => {
				stopRooms();
				stopBookings();
				stopTypes();
			});
		});

		effect(() => {
			if (this.live) this.rooms.set(withStays(this._storedRooms(), this._bookings(), this.today));
		});
	}

	protected room(number: string): Room | undefined {
		return this.rooms().find((r) => r.number === number);
	}

	protected typeByName(name: string): RoomType | undefined {
		return this.types().find((t) => t.name === name);
	}

	protected setSegment(seg: Segment): void {
		this.segment.set(seg);
	}

	protected setViewMode(mode: ViewMode): void {
		this.viewMode.set(mode);
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleTypeFilter(type: string, checked: boolean): void {
		this.hiddenTypes.update((set) => {
			const next = new Set(set);
			checked ? next.delete(type) : next.add(type);
			return next;
		});
	}

	protected toggleStatusFilter(status: RoomStatus, checked: boolean): void {
		this.statusFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(status) : next.delete(status);
			return next;
		});
	}

	protected toggleCapacityFilter(cap: string, checked: boolean): void {
		this.capacityFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(cap) : next.delete(cap);
			return next;
		});
	}

	protected setCleaningOnlyFilter(checked: boolean): void {
		this.cleaningOnlyFilter.set(checked);
	}

	protected clearFilters(): void {
		this.hiddenTypes.set(new Set());
		this.statusFilter.set(new Set<RoomStatus>(ALL_STATUSES));
		this.cleaningOnlyFilter.set(false);
		this.capacityFilter.set(new Set(['1', '2', '3', '4']));
	}

	protected askAi(key: string): void {
		this.aiAnswerKey.set(key);
	}

	protected openRoomPanel(number: string): void {
		this.selectedRoomNumber.set(number);
	}

	protected closeSidePanel(): void {
		this.selectedRoomNumber.set(null);
	}

	/** Opens an ngx-ui modal in the CRM look; `props` become the component's fields. */
	private _open(component: Type<unknown>, props: Record<string, unknown>, size: Modal['size'] = 'mid'): Modal {
		const modal = this._modal.show({
			component,
			size,
			panelClass: 'crm-modal',
			label: this._dialogLabel,
			onClose: () => this._modals.delete(modal),
			...props,
		});
		this._modals.add(modal);
		return modal;
	}

	protected openAddRoom(initialType = '', draft: { number?: string; floor?: number } = {}): void {
		const modal = this._open(RoomFormComponent, {
			room: null,
			types: this.types(),
			typeNames: this.typeNames(),
			initialType,
			draft,
			save: (value: RoomFormValue) => this.addRoom(value),
			// Creating a type leaves the room form and comes back to it with the new type selected.
			createType: ({ number, floor }: { number: string; floor: number }) => {
				modal.close?.();
				const kept = { number, floor: Number.isInteger(floor) ? floor : undefined };
				const types = this.openRoomTypes(true, (name) => {
					types.close?.();
					this.openAddRoom(name, kept);
				});
			},
		});
	}

	protected openEditRoom(number: string): void {
		const room = this.room(number);
		if (!room) return;
		const modal = this._open(RoomFormComponent, {
			room,
			types: this.types(),
			typeNames: this.typeNames(),
			save: (value: RoomFormValue) => this.editRoom(number, value),
			remove: () => {
				modal.close?.();
				this.openDeleteRoom(number);
			},
		});
	}

	protected openRoomTypes(startInAddMode = false, afterAdd?: (name: string) => void): Modal {
		return this._open(RoomTypesComponent, {
			summary: this.typeSummary,
			canEdit: this.canEditInventory,
			addType: (value: RoomTypeFormValue) => this.addType(value),
			startInAddMode,
			afterAdd,
		});
	}

	protected openBlockRoom(number: string): void {
		const room = this.room(number);
		if (!room) return;
		this._open(BlockRoomComponent, { room, today: this.today, save: (block: RoomBlock) => this.blockRoom(number, block) });
	}

	protected openChangeStatus(number: string): void {
		const room = this.room(number);
		if (!room) return;
		this._open(RoomStatusComponent, { room, live: this.live, save: (status: RoomStatus) => this.changeStatus(number, status) });
	}

	protected openDeleteRoom(number: string): void {
		this._open(
			ConfirmComponent,
			{
				title: `Видалити номер ${number}?`,
				text: this.live
					? 'Номер зникне з номерного фонду, а його минулі бронювання — з календаря. Цю дію не можна скасувати.'
					: 'Номер зникне з номерного фонду. Цю дію не можна скасувати.',
				confirmText: 'Видалити',
				confirm: () => this.deleteRoom(number),
			},
			'small',
		);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	/**
	 * Applies a room change: written to Firestore for a real hotel (the listener refreshes the list),
	 * or to the local demo list. Shows `success` as a toast; returns null when saved, else the error to show.
	 */
	private async _saveRoom(number: string, patch: RoomPatch, success: string, demo: Partial<Room> = {}): Promise<string | null> {
		const room = this.room(number);
		if (!room) return 'Номер не знайдено. Можливо, його вже видалили.';
		const { cleaned, block, ...fields } = patch;
		if (!this.live) {
			const blockFields: Partial<Room> =
				block === undefined ? {} : { reason: block?.reason, blockStart: block?.start, blockEnd: block?.end, blockNote: block?.note };
			this.rooms.update((rooms) => rooms.map((r) => (r.number === number ? { ...r, ...fields, ...blockFields, ...demo } : r)));
			this.toast(success);
			return null;
		}
		return this._write(() => this._roomsService.updateRoom(this.hotelId()!, room.id, patch), success);
	}

	private async _write(action: () => Promise<void>, success: string): Promise<string | null> {
		if (!this.hotelId()) return 'Готель не вибрано.';
		this.saving.set(true);
		try {
			await action();
			this.toast(success);
			return null;
		} catch (error) {
			console.error('Rooms write failed', error);
			return 'Не вдалося зберегти зміни. Перевірте зʼєднання та спробуйте ще раз.';
		} finally {
			this.saving.set(false);
		}
	}

	protected quickBook(): void {
		if (this.live) {
			this._router.navigateByUrl('/calendar');
			return;
		}
		this.toast('Перехід до створення бронювання · Демо');
	}

	protected assignClean(number: string): void {
		this.rooms.update((rooms) =>
			rooms.map((r) => (r.number === number ? { ...r, status: 'cleaning', assigned: 'Марія', startedAt: new Date().toTimeString().slice(0, 5) } : r)),
		);
		this.toast('Прибирання призначено · Демо');
	}

	protected async startCleaning(number: string): Promise<void> {
		const error = await this._saveRoom(number, { status: 'cleaning' }, `Номер ${number}: прибирання розпочато`);
		if (error) this.toast(error);
	}

	protected async finishCleaning(number: string): Promise<void> {
		const error = await this._saveRoom(number, { status: 'ready', cleaned: true }, `Номер ${number} прибрано та готовий`);
		if (error) this.toast(error);
	}

	protected async unblockRoom(number: string): Promise<void> {
		const error = await this._saveRoom(number, { status: 'ready', block: null }, `Номер ${number} знову доступний`);
		if (error) this.toast(error);
	}

	protected openTask(): void {
		this.toast('Перехід до прибирання · Демо');
	}

	protected openBooking(): void {
		if (this.live) {
			this._router.navigateByUrl('/calendar');
			return;
		}
		this.toast('Перехід до бронювання · Демо');
	}

	protected openCalendar(): void {
		this.toast('Перехід до календаря · Демо');
	}

	protected openHousekeeping(): void {
		this.toast('Перехід до прибирання · Демо');
	}

	private async addRoom({ number, type, floor, capacity, price, area }: RoomFormValue): Promise<string | null> {
		const n = number.trim();
		const typeName = type.trim();
		if (!n) return 'Вкажіть номер або назву.';
		if (this.rooms().some((r) => sameText(r.number, n))) return `Номер ${n} уже існує.`;
		if (!typeName) return 'Оберіть тип номера.';
		if (!Number.isInteger(floor)) return 'Вкажіть поверх цілим числом.';
		if (!Number.isInteger(capacity) || capacity < 1) return 'Місткість має бути щонайменше 1.';
		if (!(price >= 0)) return 'Вкажіть базову ціну.';
		if (this.roomLimitReached()) return `Ліміт номерів на цьому тарифі: ${this.roomLimit}. Перейдіть на вищий тариф, щоб додати більше.`;
		const base = this.types().find((t) => sameText(t.name, typeName));
		if (!base) return 'Оберіть тип номера зі списку.';
		const input = {
			number: n,
			type: base.name,
			floor,
			capacity,
			beds: base.beds,
			area: area > 0 ? area : base.area,
			price,
			amenities: base.amenities,
		};
		if (this.live) return this._write(() => this._roomsService.addRoom(this.hotelId()!, input), `Номер ${n} додано`);
		this.rooms.update((rooms) => [...rooms, { ...input, id: n, status: 'ready', guest: null, maintenanceNotes: [] }]);
		this.toast(`Номер ${n} додано`);
		return null;
	}

	private async addType({ name, description, capacity, price }: RoomTypeFormValue): Promise<string | null> {
		const n = name.trim();
		if (!n) return 'Вкажіть назву типу.';
		if (this.types().some((t) => sameText(t.name, n))) return `Тип «${n}» уже існує.`;
		if (!Number.isInteger(capacity) || capacity < 1) return 'Місткість має бути щонайменше 1.';
		if (!(price >= 0)) return 'Вкажіть базову ціну.';
		const input = { name: n, description: description.trim(), capacity, price, beds: '', area: null, amenities: [] };
		if (this.live) return this._write(() => this._roomsService.addType(this.hotelId()!, input), `Тип «${n}» створено`);
		this.types.update((types) => [...types, { ...input, id: n }]);
		this.toast(`Тип «${n}» створено`);
		return null;
	}

	private blockRoom(number: string, block: RoomBlock): Promise<string | null> {
		return this._saveRoom(number, { status: 'unavailable', block }, `Номер ${number} заблоковано`, { guest: null });
	}

	private async changeStatus(number: string, status: RoomStatus): Promise<string | null> {
		const room = this.room(number);
		if (!room) return 'Номер не знайдено. Можливо, його вже видалили.';
		if (this.live && room.status === 'occupied' && status !== 'unavailable') {
			return 'Номер зайнятий: гостя заселено. Спершу відмітьте виїзд у календарі.';
		}
		// Blocking needs dates and a reason, so it continues in the block modal.
		if (status === 'unavailable' && room.status !== 'unavailable') {
			this.openBlockRoom(number);
			return null;
		}
		const patch: RoomPatch = { status };
		if (room.status === 'unavailable' && status !== 'unavailable') patch.block = null;
		if (status === 'ready' && needsCleaning(room)) patch.cleaned = true;
		const demo: Partial<Room> = status === 'occupied' ? {} : { guest: null, needsCleaning: false };
		return this._saveRoom(number, patch, 'Статус оновлено', demo);
	}

	private async editRoom(number: string, { type, floor, capacity, price, area }: RoomFormValue): Promise<string | null> {
		const room = this.room(number);
		if (!room) return 'Номер не знайдено. Можливо, його вже видалили.';
		if (!Number.isInteger(floor)) return 'Вкажіть поверх цілим числом.';
		if (!Number.isInteger(capacity) || capacity < 1) return 'Місткість має бути щонайменше 1.';
		if (!(price >= 0)) return 'Вкажіть ціну.';
		const patch: RoomPatch = { type, floor, capacity, price, area: area > 0 ? area : null };
		// A new type brings its beds and amenities; capacity and price come from the form.
		const base = type !== room.type ? this.typeByName(type) : undefined;
		if (base) {
			patch.beds = base.beds;
			patch.amenities = base.amenities;
		}
		return this._saveRoom(number, patch, 'Зміни збережено');
	}

	private async deleteRoom(number: string): Promise<string | null> {
		const room = this.room(number);
		if (!room) return null;
		if (this.live) {
			const active = this._bookings().filter((b) => b.roomId === room.id && holdsRoom(b, this.today));
			if (active.length) {
				return `У номері ${number} є активні бронювання (${active.length}). Спершу скасуйте їх або перенесіть в інший номер у календарі.`;
			}
			const error = await this._write(() => this._roomsService.deleteRoom(this.hotelId()!, room.id), `Номер ${number} видалено`);
			if (error) return error;
		} else {
			this.rooms.update((rooms) => rooms.filter((r) => r.number !== number));
			this.toast(`Номер ${number} видалено`);
		}
		this.closeSidePanel();
		return null;
	}
}
