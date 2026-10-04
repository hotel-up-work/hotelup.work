import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PAYMENT_METHODS, type PaymentMethod } from '../../../feature/firebase/payments.service';
import type { ModalSave } from '../../rooms/rooms.interface';

export interface PayableBooking {
	id: string;
	guestName: string;
	roomNumber: string;
	stay: string;
	balance: number;
}

export interface PaymentFormValue {
	bookingId: string;
	amount: number;
	method: PaymentMethod;
	note: string;
	occurredOn: string;
}

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';

/** Record a payment against a booking with a balance (ngx-ui modal). */
@Component({
	selector: 'app-payment-form',
	imports: [FormsModule],
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>Додати оплату</h2>
			@if (!bookings.length) {
				<p>Усі бронювання оплачені: додавати нічого.</p>
			} @else {
				<form class="crm-form" (submit)="$event.preventDefault(); submit()">
					@if (bookings.length > 8) {
						<label class="full">
							Пошук бронювання
							<input name="filter" type="search" placeholder="Гість або номер" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
						</label>
					}
					<label class="full">
						Бронювання
						<select name="booking" [ngModel]="bookingId()" (ngModelChange)="pick($event)">
							@for (b of shown(); track b.id) {
								<option [value]="b.id">{{ b.guestName }} · №{{ b.roomNumber }} · {{ b.stay }} · залишок {{ money(b.balance) }}</option>
							}
						</select>
					</label>
					<label>
						Сума, ₴
						<input name="amount" type="number" min="1" [max]="selected()?.balance ?? null" required [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
					</label>
					<label>
						Дата
						<input name="date" type="date" required [max]="today" [ngModel]="date()" (ngModelChange)="date.set($event)" />
					</label>
					<label class="full">
						Спосіб оплати
						<select name="method" [ngModel]="method()" (ngModelChange)="method.set($event)">
							@for (m of methods; track m.value) {
								<option [value]="m.value">{{ m.label }}</option>
							}
						</select>
					</label>
					<label class="full">
						Примітка (необовʼязково)
						<input name="note" maxlength="300" [ngModel]="note()" (ngModelChange)="note.set($event)" />
					</label>
					@if (selected(); as b) {
						<p class="full crm-note">Залишок по бронюванню {{ money(b.balance) }}. Після запису: {{ money(Math.max(0, b.balance - (amount() ?? 0))) }}.</p>
					}
					@if (error()) {
						<p class="full crm-error" role="alert">{{ error() }}</p>
					}
					<button class="crm-button primary full" type="submit" [disabled]="saving()">Записати оплату</button>
				</form>
			}
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class PaymentFormComponent implements OnInit {
	label = '';
	bookings: PayableBooking[] = [];
	/** Booking to preselect (from its row in the outstanding list). */
	initialId = '';
	today = '';
	save: ModalSave<PaymentFormValue> = async () => null;
	close: () => void = () => {};

	protected readonly money = money;
	protected readonly Math = Math;
	protected readonly methods = PAYMENT_METHODS;
	protected readonly filter = signal('');
	protected readonly bookingId = signal('');
	protected readonly amount = signal<number | null>(null);
	protected readonly date = signal('');
	protected readonly method = signal<PaymentMethod>('cash');
	protected readonly note = signal('');
	protected readonly error = signal('');
	protected readonly saving = signal(false);

	protected readonly selected = computed(() => this.bookings.find((b) => b.id === this.bookingId()) ?? null);
	/** The filtered options, always including the picked booking so the select never loses it. */
	protected readonly shown = computed(() => {
		const q = this.filter().trim().toLocaleLowerCase('uk-UA');
		return this.bookings.filter((b) => b.id === this.bookingId() || !q || (b.guestName + ' ' + b.roomNumber).toLocaleLowerCase('uk-UA').includes(q));
	});

	ngOnInit(): void {
		this.date.set(this.today);
		const first = this.bookings.find((b) => b.id === this.initialId) ?? this.bookings[0];
		if (first) this.pick(first.id);
	}

	protected pick(id: string): void {
		this.bookingId.set(id);
		this.amount.set(this.bookings.find((b) => b.id === id)?.balance ?? null);
	}

	protected async submit(): Promise<void> {
		const booking = this.selected();
		const amount = Number(this.amount());
		if (!booking) return this.error.set('Оберіть бронювання.');
		if (!(amount > 0)) return this.error.set('Вкажіть суму більше нуля.');
		if (amount > booking.balance) return this.error.set(`Сума більша за залишок (${money(booking.balance)}).`);
		if (!this.date() || this.date() > this.today) return this.error.set('Вкажіть дату не пізніше сьогодні.');
		this.saving.set(true);
		this.error.set('');
		const error = await this.save({ bookingId: booking.id, amount, method: this.method(), note: this.note(), occurredOn: this.date() });
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
