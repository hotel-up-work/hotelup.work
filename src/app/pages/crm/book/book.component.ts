import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

interface RoomType {
	id: string;
	name: string;
	capacity: number;
	area: number;
	beds: string;
	price: number;
	features: string[];
	desc: string;
}

interface GuestInfo {
	first: string;
	last: string;
	phone: string;
	email: string;
	note: string;
}

type Screen =
	| 'search'
	| 'room-details'
	| 'guest'
	| 'payment'
	| 'review'
	| 'success'
	| 'no-availability'
	| 'error';

type PaymentMethod = 'later' | 'deposit' | 'full';

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const TODAY = '2026-09-17';
const addDays = (s: string, n: number): string => {
	const d = new Date(s + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string): number => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
const shortDate = (s: string) => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));

const ROOM_TYPES: RoomType[] = [
	{ id: 'standard', name: 'Стандарт', capacity: 2, area: 22, beds: '1 двоспальне ліжко', price: 1200, features: ['Wi-Fi', 'Кондиціонер', 'Душ'], desc: 'Затишний номер для комфортного відпочинку в центрі міста.' },
	{ id: 'lux', name: 'Люкс', capacity: 2, area: 28, beds: '1 двоспальне ліжко', price: 1600, features: ['Wi-Fi', 'Кондиціонер', 'Сніданок', 'Балкон'], desc: 'Просторий номер із великим двоспальним ліжком, окремою ванною кімнатою та балконом.' },
	{ id: 'apartments', name: 'Апартаменти', capacity: 4, area: 42, beds: '2 спальні + диван', price: 2200, features: ['Wi-Fi', 'Кондиціонер', 'Кухня', '2 кімнати'], desc: 'Просторі апартаменти для родини чи компанії — з окремою кухнею та двома кімнатами.' },
];
const CANCELLATION = 'Безкоштовне скасування до 48 годин до заїзду.';
const HOTEL = { name: 'Grand Hotel', checkIn: '14:00', checkOut: '11:00', phone: '+380671234567' };
const CONFLICT_START = '2026-09-22';
const CONFLICT_END = '2026-09-25';

@Component({
	selector: 'app-book',
	imports: [AppShellComponent, IconComponent, FormsModule, NgTemplateOutlet],
	templateUrl: './book.component.html',
	styleUrl: './book.component.scss',
})
export class BookComponent implements OnDestroy {
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly hotel = HOTEL;
	protected readonly cancellationNote = CANCELLATION;
	protected readonly roomTypes = ROOM_TYPES;
	protected readonly prefOptions = ['Тихий номер', 'Дитяче ліжечко', 'Ранній заїзд', 'Пізній заїзд'];

	protected readonly screen = signal<Screen>('search');

	// search state
	protected readonly start = signal(TODAY);
	protected readonly end = signal(addDays(TODAY, 3));
	protected readonly adults = signal(2);
	protected readonly children = signal(0);
	protected readonly guestPopoverOpen = signal(false);
	protected readonly searchError = signal('');
	protected readonly hasSearched = signal(false);
	protected readonly sort = signal<'rec' | 'asc' | 'desc'>('rec');

	// results / room details
	protected readonly detailsRoomId = signal<string | null>(null);
	protected readonly noAvailabilityAlt = signal(false);

	// selected room + hold timer
	protected readonly selectedRoomId = signal<string | null>(null);
	protected readonly holdSeconds = signal(600);
	private _holdTimer?: ReturnType<typeof setInterval>;

	// guest step
	protected readonly guest = signal<GuestInfo>({ first: '', last: '', phone: '', email: '', note: '' });
	protected readonly prefs = signal<string[]>([]);
	protected readonly arrival = signal('unknown');
	protected readonly guestFormError = signal('');

	// payment step
	protected readonly payment = signal<PaymentMethod>('later');
	protected readonly depositAmount = signal(1500);
	protected readonly termsAccepted = signal(false);
	protected readonly paymentFormError = signal('');

	// confirmation
	protected readonly bookingId = signal<number | null>(null);

	protected readonly nights = computed(() => dayDiff(this.start(), this.end()));

	protected readonly selectedRoom = computed(() => this.roomTypes.find((t) => t.id === this.selectedRoomId()) ?? null);

	protected readonly detailsRoom = computed(() => this.roomTypes.find((t) => t.id === this.detailsRoomId()) ?? null);

	protected readonly totalPrice = computed(() => (this.selectedRoom() ? this.selectedRoom()!.price * this.nights() : 0));

	protected readonly paidNow = computed(() => {
		const method = this.payment();
		if (method === 'full') return this.totalPrice();
		if (method === 'deposit') return this.depositAmount();
		return 0;
	});

	protected readonly guestDisplay = computed(() => `${this.adults()} дорослих${this.children() ? ', ' + this.children() + ' дітей' : ''}`);

	protected readonly holdLabel = computed(() => {
		const m = Math.floor(this.holdSeconds() / 60);
		const s = this.holdSeconds() % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
	});

	/** Demo conflict: Lux is sold out for the 22–25 September window. */
	protected readonly availableTypes = computed(() =>
		this.roomTypes.filter((t) => !(t.id === 'lux' && this.start() === CONFLICT_START && this.end() === CONFLICT_END)),
	);

	protected readonly sortedRooms = computed(() => {
		const adults = this.adults();
		let list = this.availableTypes().filter((t) => t.capacity >= adults);
		const sort = this.sort();
		list = list.slice();
		if (sort === 'asc') list.sort((a, b) => a.price - b.price);
		if (sort === 'desc') list.sort((a, b) => b.price - a.price);
		return list;
	});

	protected readonly altRooms = computed(() => this.roomTypes.filter((t) => t.id !== 'lux'));

	protected readonly altDates = computed(() => {
		const a: [string, string] = [addDays(this.start(), -1), addDays(this.end(), -1)];
		const b: [string, string] = [addDays(this.start(), 1), addDays(this.end(), 1)];
		return { a, b };
	});

	protected readonly showStickyBar = computed(
		() => !!this.selectedRoom() && ['room-details', 'guest', 'payment'].includes(this.screen()),
	);

	ngOnDestroy(): void {
		clearInterval(this._holdTimer);
	}

	protected setStart(value: string): void {
		this.start.set(value);
		if (this.end() <= value) this.end.set(addDays(value, 3));
	}

	protected setEnd(value: string): void {
		this.end.set(value);
	}

	protected toggleGuestPopover(): void {
		this.guestPopoverOpen.update((open) => !open);
	}

	protected closeGuestPopover(): void {
		this.guestPopoverOpen.set(false);
	}

	protected adjustGuests(key: 'adults' | 'children', delta: number): void {
		const min = key === 'adults' ? 1 : 0;
		if (key === 'adults') this.adults.update((v) => Math.max(min, v + delta));
		else this.children.update((v) => Math.max(min, v + delta));
	}

	protected search(): void {
		this.hasSearched.set(true);
		if (this.nights() <= 0) {
			this.searchError.set('Виїзд має бути після заїзду.');
			return;
		}
		this.searchError.set('');
		if (this.nights() > 14) {
			this.screen.set('error');
			return;
		}
		if (!this.availableTypes().length) {
			this.showNoAvailability();
			return;
		}
	}

	private showNoAvailability(): void {
		this.noAvailabilityAlt.set(false);
		this.screen.set('no-availability');
	}

	protected viewDetails(id: string): void {
		this.detailsRoomId.set(id);
		this.screen.set('room-details');
	}

	protected backToResults(): void {
		this.screen.set('search');
	}

	protected selectRoom(id: string): void {
		const conflict = this.start() === CONFLICT_START && this.end() === CONFLICT_END && id === 'lux';
		if (conflict) {
			this.noAvailabilityAlt.set(true);
			this.screen.set('no-availability');
			return;
		}
		this.selectedRoomId.set(id);
		this.startHold();
		this.screen.set('guest');
	}

	private startHold(): void {
		clearInterval(this._holdTimer);
		this.holdSeconds.set(600);
		this._holdTimer = setInterval(() => {
			this.holdSeconds.update((s) => Math.max(0, s - 1));
			if (this.holdSeconds() <= 0) clearInterval(this._holdTimer);
		}, 1000);
	}

	protected togglePref(pref: string): void {
		this.prefs.update((list) => (list.includes(pref) ? list.filter((p) => p !== pref) : [...list, pref]));
	}

	protected updateGuest(field: keyof GuestInfo, value: string): void {
		this.guest.update((g) => ({ ...g, [field]: value }));
	}

	protected submitGuestForm(): void {
		const g = this.guest();
		if (!g.first.trim() || !g.phone.trim()) {
			this.guestFormError.set('Вкажіть ім’я та телефон.');
			return;
		}
		this.guestFormError.set('');
		this.screen.set('payment');
	}

	protected backToGuest(): void {
		this.screen.set('guest');
	}

	protected choosePayment(method: PaymentMethod): void {
		this.payment.set(method);
	}

	protected submitPaymentForm(): void {
		if (!this.termsAccepted()) {
			this.paymentFormError.set('Підтвердьте погодження з правилами бронювання.');
			return;
		}
		this.paymentFormError.set('');
		this.screen.set('review');
	}

	protected backToPayment(): void {
		this.screen.set('payment');
	}

	protected confirmBooking(): void {
		clearInterval(this._holdTimer);
		this.bookingId.set(1842);
		this.screen.set('success');
	}

	protected changeDates(altStart: string, altEnd: string): void {
		this.start.set(altStart);
		this.end.set(altEnd);
		this.screen.set('search');
		this.search();
	}

	protected retrySearch(): void {
		this.screen.set('search');
	}

	protected continueFromStickyBar(): void {
		const screen = this.screen();
		if (screen === 'room-details') this.screen.set('guest');
		else if (screen === 'guest') this.submitGuestForm();
		else if (screen === 'payment') this.submitPaymentForm();
	}
}
