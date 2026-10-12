import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { limitRoomsToPlan } from '../../shared/plan';

interface Room {
	number: string;
	type: string;
	capacity: number;
	beds: string;
	amenity: string;
	price: number;
}

interface ExistingBooking {
	room: string;
	start: string;
	end: string;
}

interface DbGuest {
	name: string;
	phone: string;
	email: string;
	stays: number;
	spent: number;
}

interface NewGuestData {
	name: string;
	surname: string;
	phone: string;
	email: string;
}

type GuestMode = 'search' | 'new';
type PaymentOption = 'none' | 'deposit' | 'full';
type ValidationError = 'dates' | 'room' | 'guest' | 'channel';

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const MS = 86400000;
const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const addDays = (s: string, n: number) => {
	const d = toDate(s);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
const shortDate = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toDate(s));

const TODAY = '2026-09-17';

const ROOMS: Room[] = [
	{ number: '101', type: 'Стандарт', capacity: 2, beds: '1 двоспальне ліжко', amenity: 'Сніданок включено', price: 1600 },
	{ number: '102', type: 'Стандарт', capacity: 2, beds: '1 двоспальне ліжко', amenity: 'Сніданок включено', price: 1600 },
	{ number: '103', type: 'Стандарт', capacity: 2, beds: '2 окремих ліжка', amenity: 'Сніданок включено', price: 1600 },
	{ number: '106', type: 'Покращений', capacity: 3, beds: '1 двоспальне + диван', amenity: 'Балкон', price: 2000 },
	{ number: '107', type: 'Покращений', capacity: 3, beds: '1 двоспальне + диван', amenity: 'Балкон', price: 2000 },
	{ number: '204', type: 'Люкс', capacity: 2, beds: '1 двоспальне ліжко', amenity: 'Сніданок включено', price: 1600 },
	{ number: '205', type: 'Люкс', capacity: 3, beds: '1 двоспальне + диван', amenity: 'Балкон', price: 1800 },
	{ number: '301', type: 'Апартаменти', capacity: 4, beds: '2 кімнати', amenity: 'Кухня', price: 2200 },
	{ number: '302', type: 'Апартаменти', capacity: 4, beds: '2 кімнати', amenity: 'Кухня', price: 2200 },
];

const EXISTING_BOOKINGS: ExistingBooking[] = [
	{ room: '204', start: '2026-09-22', end: '2026-09-25' },
	{ room: '106', start: '2026-09-18', end: '2026-09-20' },
	{ room: '301', start: '2026-09-19', end: '2026-09-21' },
];

const GUESTS_DB: DbGuest[] = [
	{ name: 'Анна Коваленко', phone: '+380 67 123 45 67', email: 'anna@example.com', stays: 4, spent: 28400 },
	{ name: 'Олег Бондар', phone: '+380 50 222 11 33', email: '', stays: 1, spent: 2400 },
	{ name: 'Марія Петренко', phone: '+380 63 456 78 90', email: '', stays: 2, spent: 14200 },
];

const PREF_OPTIONS = ['Тихий номер', 'Верхній поверх', 'Нижній поверх', 'Дитяче ліжечко', 'Ранній заїзд', 'Пізній заїзд'];

@Component({
	selector: 'app-new-booking',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './new-booking.component.html',
	styleUrl: './new-booking.component.scss',
})
export class NewBookingComponent {
	private readonly rooms = limitRoomsToPlan(ROOMS);
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly prefOptions = PREF_OPTIONS;
	protected readonly Number = Number;
	protected readonly Math = Math;

	constructor(private readonly router: Router) {}

	// dates
	protected readonly start = signal(TODAY);
	protected readonly end = signal(addDays(TODAY, 3));

	// guests count
	protected readonly adults = signal(2);
	protected readonly children = signal(0);

	// room selection
	protected readonly selectedRoom = signal<Room | null>(null);

	// guest
	protected readonly guestMode = signal<GuestMode>('search');
	protected readonly guestQuery = signal('');
	protected readonly selectedGuest = signal<DbGuest | null>(null);
	protected readonly newGuestData = signal<NewGuestData>({ name: '', surname: '', phone: '', email: '' });

	// price
	protected readonly priceOverride = signal<number | null>(null);
	protected readonly priceReason = signal('');
	protected readonly priceNote = signal('');
	protected readonly priceModalOpen = signal(false);

	// payment
	protected readonly payment = signal<PaymentOption>('none');
	protected readonly depositAmount = signal(0);
	protected readonly depositMethod = signal('Готівка');

	// source
	protected readonly channel = signal('');
	protected readonly discovery = signal('');

	// arrival
	protected readonly arrivalUnknown = signal(true);
	protected readonly arrivalTime = signal('');

	// prefs
	protected readonly prefs = signal<string[]>([]);
	protected readonly otherPrefModalOpen = signal(false);

	// note
	protected readonly note = signal('');

	// confirmation message
	protected readonly confirmSend = signal(true);
	protected readonly messageOverride = signal<string | null>(null);
	protected readonly messageModalOpen = signal(false);

	// dialogs / toast
	protected readonly unavailableModalOpen = signal(false);
	protected readonly successModalOpen = signal(false);
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly errDates = signal(false);
	protected readonly errRoom = signal(false);
	protected readonly errGuest = signal(false);
	protected readonly errChannel = signal(false);

	protected readonly nights = computed(() => dayDiff(this.start(), this.end()));

	protected readonly guestName = computed(() => {
		const selected = this.selectedGuest();
		if (selected) return selected.name;
		const data = this.newGuestData();
		return data.name ? (data.name + ' ' + (data.surname || '')).trim() : '';
	});

	protected readonly guestPhone = computed(() => this.selectedGuest()?.phone ?? this.newGuestData().phone ?? '');
	protected readonly guestEmail = computed(() => this.selectedGuest()?.email ?? this.newGuestData().email ?? '');

	protected readonly availableRooms = computed(() => {
		const total = this.adults() + this.children();
		return this.rooms.filter((r) => r.capacity >= total && !this._roomsOverlap(r.number, this.start(), this.end()));
	});

	protected readonly basePrice = computed(() => (this.selectedRoom() ? this.selectedRoom()!.price * this.nights() : 0));
	protected readonly finalPrice = computed(() => this.priceOverride() ?? this.basePrice());
	protected readonly paidAmount = computed(() =>
		this.payment() === 'full' ? this.finalPrice() : this.payment() === 'deposit' ? this.depositAmount() : 0,
	);
	protected readonly remaining = computed(() => this.finalPrice() - this.paidAmount());
	protected readonly priceDiscount = computed(() => this.basePrice() - this.finalPrice());

	protected readonly guestResults = computed(() => {
		const q = this.guestQuery().trim().toLocaleLowerCase('uk-UA');
		if (!q) return [];
		return GUESTS_DB.filter((g) => (g.name + ' ' + g.phone).toLocaleLowerCase('uk-UA').includes(q));
	});

	protected readonly altDates = computed(() => {
		if (this.availableRooms().length || this.nights() <= 0) return [];
		const total = this.adults() + this.children();
		const altA: [string, string] = [addDays(this.start(), -1), addDays(this.end(), -1)];
		const altB: [string, string] = [addDays(this.start(), 1), addDays(this.end(), 1)];
		const countFor = (s: string, e: string) => this.rooms.filter((r) => r.capacity >= total && !this._roomsOverlap(r.number, s, e)).length;
		return [
			{ start: altA[0], end: altA[1], count: countFor(altA[0], altA[1]) },
			{ start: altB[0], end: altB[1], count: countFor(altB[0], altB[1]) },
		];
	});

	protected readonly paymentSummary = computed(() => {
		if (this.payment() === 'none') return `Статус оплати: Не оплачено · Залишок: ${money(this.finalPrice())}`;
		if (this.payment() === 'full') return 'Статус оплати: Оплачено';
		return `Статус оплати: Частково оплачено · Залишок: ${money(this.remaining())}`;
	});

	protected readonly messageTemplate = computed(() => {
		const firstName = this.guestName().split(' ')[0] || 'Гостю';
		const room = this.selectedRoom();
		return `Вітаємо, ${firstName}!\nВаше бронювання в Grand Hotel підтверджено.\n${Number(this.start().slice(-2))}–${Number(this.end().slice(-2))} вересня\nНомер: ${room ? room.type + ' ' + room.number : '—'}\n${this.nights()} ночі\nСума: ${money(this.finalPrice())}`;
	});

	protected readonly messagePreview = computed(() => this.messageOverride() ?? this.messageTemplate());

	protected readonly nightsNote = computed(() =>
		this.nights() > 0 ? `${shortDate(this.start())} – ${shortDate(this.end())} · ${this.nights()} ночі` : '',
	);

	protected readonly validationErrors = computed<ValidationError[]>(() => {
		const errs: ValidationError[] = [];
		if (!(this.nights() > 0)) errs.push('dates');
		if (!this.selectedRoom()) errs.push('room');
		if (!this.guestName().trim() || (!this.guestPhone().trim() && !this.guestEmail().trim())) errs.push('guest');
		if (!this.channel()) errs.push('channel');
		return errs;
	});

	protected readonly isValid = computed(() => this.validationErrors().length === 0);

	protected onStartChange(value: string): void {
		this.start.set(value);
		if (this.end() <= value) this.end.set(addDays(value, 1));
	}

	protected onEndChange(value: string): void {
		this.end.set(value);
	}

	protected stepAdults(delta: number): void {
		this.adults.update((v) => Math.max(1, v + delta));
	}

	protected stepChildren(delta: number): void {
		this.children.update((v) => Math.max(0, v + delta));
	}

	protected selectRoom(room: Room): void {
		this.selectedRoom.set(room);
		this.errRoom.set(false);
	}

	protected selectAltDates(start: string, end: string): void {
		this.start.set(start);
		this.end.set(end);
	}

	protected onGuestQueryChange(value: string): void {
		this.guestQuery.set(value);
	}

	protected pickGuest(guest: DbGuest): void {
		this.selectedGuest.set(guest);
		this.errGuest.set(false);
	}

	protected startNewGuest(): void {
		this.guestMode.set('new');
		this.newGuestData.set({ name: '', surname: '', phone: '', email: '' });
	}

	protected backToSearch(): void {
		this.guestMode.set('search');
	}

	protected changeGuest(): void {
		this.selectedGuest.set(null);
		this.guestMode.set('search');
		this.guestQuery.set('');
	}

	protected updateNewGuest(field: keyof NewGuestData, value: string): void {
		this.newGuestData.update((d) => ({ ...d, [field]: value }));
		this.errGuest.set(false);
	}

	protected openPriceModal(): void {
		this.priceModalOpen.set(true);
	}

	protected closePriceModal(): void {
		this.priceModalOpen.set(false);
	}

	protected submitPrice(final: number, reason: string, note: string): void {
		if (!Number.isFinite(final) || final <= 0) return;
		this.priceOverride.set(final);
		this.priceReason.set(reason);
		this.priceNote.set(note);
		this.closePriceModal();
		this.toast('Ціну оновлено');
	}

	protected selectPayment(option: PaymentOption): void {
		this.payment.set(option);
		if (option === 'deposit' && !this.depositAmount()) this.depositAmount.set(Math.round(this.finalPrice() / 2));
	}

	protected onDepositAmountChange(value: number): void {
		this.depositAmount.set(Number.isFinite(value) ? value : 0);
	}

	protected onChannelChange(value: string): void {
		this.channel.set(value);
		this.errChannel.set(false);
	}

	protected onDiscoveryChange(value: string): void {
		this.discovery.set(value);
	}

	protected onArrivalUnknownChange(checked: boolean): void {
		this.arrivalUnknown.set(checked);
	}

	protected togglePref(pref: string): void {
		this.prefs.update((list) => (list.includes(pref) ? list.filter((p) => p !== pref) : [...list, pref]));
	}

	protected openOtherPrefModal(): void {
		this.otherPrefModalOpen.set(true);
	}

	protected closeOtherPrefModal(): void {
		this.otherPrefModalOpen.set(false);
	}

	protected submitOtherPref(pref: string): void {
		const trimmed = pref.trim();
		if (!trimmed) return;
		this.prefs.update((list) => [...list, trimmed]);
		this.closeOtherPrefModal();
		this.toast('Побажання додано');
	}

	protected toggleConfirmSend(): void {
		this.confirmSend.update((v) => !v);
	}

	protected openMessageModal(): void {
		this.messageModalOpen.set(true);
	}

	protected closeMessageModal(): void {
		this.messageModalOpen.set(false);
	}

	protected submitMessage(text: string): void {
		this.messageOverride.set(text);
		this.closeMessageModal();
		this.toast('Текст повідомлення збережено');
	}

	protected closeUnavailableModal(): void {
		this.unavailableModalOpen.set(false);
	}

	protected alternativeRooms(): Room[] {
		const room = this.selectedRoom();
		if (!room) return [];
		const total = this.adults() + this.children();
		return this.rooms.filter((r) => r.number !== room.number && r.capacity >= total && !this._roomsOverlap(r.number, this.start(), this.end()));
	}

	protected pickAlternativeRoom(room: Room): void {
		this.selectedRoom.set(room);
		this.closeUnavailableModal();
	}

	protected goToCalendar(): void {
		this.router.navigateByUrl('/calendar');
	}

	protected createAnother(): void {
		this.successModalOpen.set(false);
		this.selectedRoom.set(null);
		this.selectedGuest.set(null);
		this.guestMode.set('search');
		this.guestQuery.set('');
		this.newGuestData.set({ name: '', surname: '', phone: '', email: '' });
		this.priceOverride.set(null);
		this.priceReason.set('');
		this.payment.set('none');
		this.depositAmount.set(0);
		this.channel.set('');
		this.discovery.set('');
		this.prefs.set([]);
		this.note.set('');
		this.messageOverride.set(null);
		this.start.set(TODAY);
		this.end.set(addDays(TODAY, 3));
	}

	protected submit(): void {
		const errs = this.validationErrors();
		if (errs.length) {
			this.errDates.set(errs.includes('dates'));
			this.errRoom.set(errs.includes('room'));
			this.errGuest.set(errs.includes('guest'));
			this.errChannel.set(errs.includes('channel'));
			return;
		}
		const room = this.selectedRoom()!;
		if (this._roomsOverlap(room.number, this.start(), this.end())) {
			this.unavailableModalOpen.set(true);
			return;
		}
		this.successModalOpen.set(true);
	}

	private _roomsOverlap(room: string, start: string, end: string): boolean {
		return EXISTING_BOOKINGS.some((b) => b.room === room && start < b.end && end > b.start);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
