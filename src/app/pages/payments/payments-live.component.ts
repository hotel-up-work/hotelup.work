import { Component, DestroyRef, computed, effect, inject, signal, type Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalService, type Modal } from '@wawjs/ngx-ui';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingRecord, BookingsService } from '../../feature/firebase/bookings.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { localDay, methodLabel, PAYMENT_METHODS, PaymentRecord, PaymentsService, type PaymentMethod } from '../../feature/firebase/payments.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent } from '../../shared/role';
import { PaymentFormComponent, type PayableBooking, type PaymentFormValue } from './dialogs/payment-form.component';

type Period = 'today' | 'week' | 'month' | 'all';

const OUTSTANDING_SHOWN = 8;

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const fmt = (iso: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
const addDays = (iso: string, days: number) => {
	const d = new Date(iso + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};
const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** Ukrainian plural: 1 бронювання, 2 бронювання, 5 бронювань. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

/**
 * Real hotels: the payment journal (`hotels/{hotelId}/payments`) and who still owes what (CRM.md → `payments`).
 * Roles without hotel-wide finance reports see only the entries they recorded themselves.
 */
@Component({
	selector: 'app-payments-live',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './payments-live.component.html',
	styleUrl: './payments-live.component.scss',
})
export class PaymentsLiveComponent {
	private readonly _paymentsService = inject(PaymentsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _hotel = inject(HotelService);
	private readonly _modal = inject(ModalService);
	/** ngx-ui modals opened by this page; closed when the page is left. */
	private readonly _modals = new Set<Modal>();

	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	/** Hotel-wide receipts, monthly totals, method breakdown and export. Others see their own entries only. */
	protected readonly isFinance = canCurrent('financeReports');
	protected readonly canCollect = canCurrent('collectPayment');

	protected readonly money = money;
	protected readonly fmt = fmt;
	protected readonly methodLabel = methodLabel;
	protected readonly METHODS = PAYMENT_METHODS;
	protected readonly today = localDay(new Date());

	private readonly _payments = signal<PaymentRecord[]>([]);
	private readonly _bookings = signal<BookingRecord[]>([]);
	private readonly _paymentsLoaded = signal(false);
	private readonly _bookingsLoaded = signal(false);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._paymentsLoaded() || !this._bookingsLoaded());
	protected readonly ready = computed(() => !!this.hotelId() && !this.loading() && !this.loadError());

	protected readonly period = signal<Period>('week');
	protected readonly methodFilter = signal<'all' | PaymentMethod>('all');
	protected readonly search = signal('');
	protected readonly showAllOutstanding = signal(false);
	protected readonly saving = signal(false);
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	private readonly _uid = computed(() => this._paymentsService.recorder().uid);

	/** What this role may see: everything, or only what the person recorded. */
	private readonly _scoped = computed(() => (this.isFinance ? this._payments() : this._payments().filter((p) => p.recordedByUid === this._uid())));

	protected readonly list = computed(() => {
		const today = this.today;
		const period = this.period();
		const from = period === 'week' ? addDays(today, -6) : '';
		const month = today.slice(0, 7);
		const method = this.methodFilter();
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		return this._scoped().filter(
			(p) =>
				(period === 'all' || (period === 'today' && p.occurredOn === today) || (period === 'week' && p.occurredOn >= from) || (period === 'month' && p.occurredOn.startsWith(month))) &&
				(method === 'all' || p.method === method) &&
				(!q || (p.guestName + ' ' + p.roomNumber).toLocaleLowerCase('uk-UA').includes(q)),
		);
	});

	protected readonly listTotal = computed(() => this.list().reduce((sum, p) => sum + p.amount, 0));

	protected readonly kpis = computed(() => {
		const scoped = this._scoped();
		const today = scoped.filter((p) => p.occurredOn === this.today);
		const month = this.today.slice(0, 7);
		const owing = this.outstanding();
		return {
			today: today.reduce((sum, p) => sum + p.amount, 0),
			todayCount: today.length,
			month: scoped.filter((p) => p.occurredOn.startsWith(month)).reduce((sum, p) => sum + p.amount, 0),
			owing: owing.reduce((sum, b) => sum + (b.total - b.paid), 0),
			owingCount: owing.length,
			byMethod: this.METHODS.map((m) => ({ ...m, amount: today.filter((p) => p.method === m.value).reduce((sum, p) => sum + p.amount, 0) })).filter((m) => m.amount > 0),
		};
	});

	/** Bookings that still owe money, soonest arrival first. Cancelled ones owe nothing. */
	protected readonly outstanding = computed(() =>
		this._bookings()
			.filter((b) => b.status !== 'cancelled' && b.total > b.paid)
			.sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
	);

	protected readonly outstandingShown = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const list = this.outstanding().filter((b) => !q || (b.guestName + ' ' + b.roomNumber).toLocaleLowerCase('uk-UA').includes(q));
		return this.showAllOutstanding() ? list : list.slice(0, OUTSTANDING_SHOWN);
	});
	protected readonly outstandingHidden = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const total = this.outstanding().filter((b) => !q || (b.guestName + ' ' + b.roomNumber).toLocaleLowerCase('uk-UA').includes(q)).length;
		return Math.max(0, total - OUTSTANDING_SHOWN);
	});

	/** Bookings that show money as paid which the journal does not account for (taken before the journal existed). */
	protected readonly unjournaled = computed(() => {
		const journaled = new Map<string, number>();
		for (const p of this._payments()) journaled.set(p.bookingId, (journaled.get(p.bookingId) ?? 0) + p.amount);
		return this._bookings()
			.map((booking) => ({ booking, amount: booking.paid - (journaled.get(booking.id) ?? 0) }))
			.filter((x) => x.amount > 0);
	});
	protected readonly unjournaledSum = computed(() => this.unjournaled().reduce((sum, x) => sum + x.amount, 0));

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			for (const modal of this._modals) modal.close?.();
		});

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!hotelId) return;
			this._payments.set([]);
			this._bookings.set([]);
			this._paymentsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			const onError = (error: Error) => {
				// Most often missing rules for hotels/{id}/payments: deploy firestore.rules.
				console.error('Payments listener failed', error);
				this.loadError.set('Не вдалося завантажити оплати. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopPayments = this._paymentsService.listen(
				hotelId,
				(payments) => {
					this._payments.set(payments);
					this._paymentsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(bookings) => {
					this._bookings.set(bookings);
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			onCleanup(() => {
				stopPayments();
				stopBookings();
			});
		});
	}

	protected readonly bookingsLabel = (n: number) => `${n} ${plural(n, 'бронювання', 'бронювання', 'бронювань')}`;
	protected readonly balanceOf = (b: BookingRecord) => b.total - b.paid;
	protected stay(b: BookingRecord): string {
		return `${fmt(b.checkIn)} – ${fmt(b.checkOut)}`;
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	private _open(component: Type<unknown>, props: Record<string, unknown>, size: Modal['size'] = 'mid'): Modal {
		const modal = this._modal.show({
			component,
			size,
			panelClass: 'crm-modal',
			label: 'ОПЛАТИ',
			onClose: () => this._modals.delete(modal),
			...props,
		});
		this._modals.add(modal);
		return modal;
	}

	protected openAdd(bookingId = ''): void {
		if (!this.ready() || !this.canCollect) return;
		const bookings: PayableBooking[] = this.outstanding().map((b) => ({
			id: b.id,
			guestName: b.guestName,
			roomNumber: b.roomNumber,
			stay: this.stay(b),
			balance: this.balanceOf(b),
		}));
		this._open(PaymentFormComponent, {
			bookings,
			initialId: bookingId,
			today: this.today,
			save: async (value: PaymentFormValue): Promise<string | null> => {
				const hotelId = this.hotelId();
				const booking = this._bookings().find((b) => b.id === value.bookingId);
				if (!hotelId || !booking) return 'Бронювання не знайдено. Можливо, його змінили.';
				// The balance may have changed since the form opened (someone else recorded a payment).
				if (value.amount > this.balanceOf(booking)) return `Сума більша за залишок (${money(this.balanceOf(booking))}).`;
				this.saving.set(true);
				try {
					await this._paymentsService.record(
						hotelId,
						{ id: booking.id, guestName: booking.guestName, roomNumber: booking.roomNumber },
						{ amount: value.amount, method: value.method, note: value.note, occurredOn: value.occurredOn },
					);
					this.toast(`Оплату ${money(value.amount)} записано · ${booking.guestName}`);
					return null;
				} catch (error) {
					console.error('Payment record failed', error);
					return 'Не вдалося записати оплату. Перевірте зʼєднання та спробуйте ще раз.';
				} finally {
					this.saving.set(false);
				}
			},
		});
	}

	protected async backfill(): Promise<void> {
		const hotelId = this.hotelId();
		if (!hotelId || !this.ready() || !this.canCollect || this.saving()) return;
		this.saving.set(true);
		try {
			const count = await this._paymentsService.backfill(hotelId, this.unjournaled());
			this.toast(`Додано записів у журнал: ${count}`);
		} catch (error) {
			console.error('Payment backfill failed', error);
			this.toast('Не вдалося додати записи. Перевірте зʼєднання та спробуйте ще раз.');
		} finally {
			this.saving.set(false);
		}
	}

	protected exportCsv(): void {
		if (!this.isFinance) return;
		const header = ['Дата', 'Гість', 'Номер', 'Спосіб', 'Сума, ₴', 'Записав', 'Примітка'];
		const rows = this.list().map((p) => [p.occurredOn, p.guestName, p.roomNumber, methodLabel(p.method), p.amount, p.recordedBy, p.note]);
		const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `payments-${this.today}.csv`;
		link.click();
		URL.revokeObjectURL(url);
		this.toast(`Експортовано оплат: ${rows.length}`);
	}
}
