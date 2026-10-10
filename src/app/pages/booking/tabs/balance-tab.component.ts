import { Component, computed, inject, input, signal } from '@angular/core';
import type { BookingRecord } from '../../../feature/firebase/bookings.service';
import { BookingDemoStore, PAYMENT_METHODS } from '../booking-card.demo';
import { dayLabel, money } from './format';

/** Demo tab: the statement of charges and payments, and what is still due. */
@Component({
	selector: 'app-booking-balance',
	styleUrl: './tab-panel.scss',
	template: `
		<section class="panel">
			<div class="panel-head">
				<h2>Баланс бронювання</h2>
				<span class="chip" [class.green]="due() <= 0" [class.gold]="due() > 0">{{ due() > 0 ? 'До сплати ' + money(due()) : 'Сплачено повністю' }}</span>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Дата</th>
							<th>Опис</th>
							<th class="num">Кількість</th>
							<th class="num">Нараховано</th>
							<th class="num">Оплачено</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{{ day(booking().checkIn) }}</td>
							<td>Проживання, номер {{ booking().roomNumber }}</td>
							<td class="num">1</td>
							<td class="num">{{ money(booking().total) }}</td>
							<td class="num"></td>
						</tr>
						@for (c of store.services(); track c.id) {
							<tr>
								<td>{{ day(c.date) }}</td>
								<td>{{ c.service }}</td>
								<td class="num">{{ c.qty }}</td>
								<td class="num">{{ money(c.qty * c.price) }}</td>
								<td class="num"></td>
							</tr>
						}
						@for (p of store.payments(); track p.id) {
							<tr>
								<td>{{ day(p.date) }}</td>
								<td>Оплата · {{ p.method }} <span class="hint">{{ p.note }}</span></td>
								<td class="num"></td>
								<td class="num"></td>
								<td class="num">{{ money(p.amount) }}</td>
							</tr>
						}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="3">Разом</td>
							<td class="num">{{ money(charged()) }}</td>
							<td class="num">{{ money(booking().paid) }}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<div class="totals">
				<span class="big">До сплати: <b>{{ money(due()) }}</b></span>
			</div>
		</section>

		@if (canPay()) {
			<section class="panel">
				<div class="panel-head"><h3>Додати оплату</h3></div>
				<form class="add-row" (submit)="add($event, amount.value, method.value, date.value, note.value)">
					<label class="f">
						Сума, ₴
						<input #amount type="number" min="1" [max]="due()" step="0.01" [value]="due() > 0 ? due() : ''" [disabled]="readOnly()" />
					</label>
					<label class="f">
						Спосіб
						<select #method [disabled]="readOnly()">
							@for (m of methods; track m) {
								<option [value]="m">{{ m }}</option>
							}
						</select>
					</label>
					<label class="f">
						Дата
						<input #date type="date" value="2026-09-17" [disabled]="readOnly()" />
					</label>
					<label class="f">
						Нотатка
						<input #note maxlength="120" [disabled]="readOnly()" />
					</label>
					<button type="submit" class="btn primary" [disabled]="readOnly() || due() <= 0">Зберегти оплату</button>
				</form>
				@if (error()) {
					<p class="hint" role="alert">{{ error() }}</p>
				}
			</section>
		}
	`,
})
export class BalanceTabComponent {
	protected readonly store = inject(BookingDemoStore);
	readonly booking = input.required<BookingRecord>();
	readonly readOnly = input(false);
	readonly canPay = input(true);

	protected readonly money = money;
	protected readonly day = dayLabel;
	protected readonly methods = PAYMENT_METHODS;
	protected readonly error = signal('');

	protected readonly charged = computed(() => this.booking().total + this.store.servicesTotal());
	protected readonly due = computed(() => Math.max(0, this.charged() - this.booking().paid));

	protected add(event: Event, amountRaw: string, method: string, date: string, note: string): void {
		event.preventDefault();
		const amount = Number(amountRaw);
		if (!Number.isFinite(amount) || amount <= 0) return void this.error.set('Вкажіть суму більше нуля');
		if (amount > this.due()) return void this.error.set(`Сума більша за залишок (${money(this.due())})`);
		if (!date) return void this.error.set('Вкажіть дату');
		this.error.set('');
		this.store.addPayment(amount, method, date, note);
	}
}
