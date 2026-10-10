import { Component, computed, inject, input, signal } from '@angular/core';
import type { BookingRecord } from '../../../feature/firebase/bookings.service';
import { nightsBetween } from '../../../shared/booking-rules';
import { BookingDemoStore, SERVICES } from '../booking-card.demo';
import { dayLabel, money } from './format';

/** Demo tab: what the guest is charged. Accommodation is automatic; other services are added by hand. */
@Component({
	selector: 'app-booking-charges',
	styleUrl: './tab-panel.scss',
	template: `
		<section class="panel">
			<div class="panel-head">
				<h2>Нарахування</h2>
				<span class="hint">Проживання нараховується автоматично, послуги додає персонал</span>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Послуга</th>
							<th>Дата</th>
							<th class="num">Кількість</th>
							<th class="num">Ціна</th>
							<th class="num">Сума</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr class="auto">
							<td>Проживання, номер {{ booking().roomNumber }} <span class="chip">авто</span></td>
							<td>{{ day(booking().checkIn) }} – {{ day(booking().checkOut) }}</td>
							<td class="num">{{ nights() }}</td>
							<td class="num">{{ money(nightPrice()) }}</td>
							<td class="num">{{ money(booking().total) }}</td>
							<td></td>
						</tr>
						@for (c of store.services(); track c.id) {
							<tr>
								<td>{{ c.service }}</td>
								<td>{{ day(c.date) }}</td>
								<td class="num">{{ c.qty }}</td>
								<td class="num">{{ money(c.price) }}</td>
								<td class="num">{{ money(c.qty * c.price) }}</td>
								<td class="num">
									<button type="button" class="btn small danger" [disabled]="readOnly()" (click)="store.removeCharge(c.id)">Видалити</button>
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
			<div class="totals">
				<span>Проживання: <b>{{ money(booking().total) }}</b></span>
				<span>Послуги: <b>{{ money(store.servicesTotal()) }}</b></span>
				<span class="big">Разом нараховано: <b>{{ money(booking().total + store.servicesTotal()) }}</b></span>
			</div>
		</section>

		<section class="panel">
			<div class="panel-head"><h3>Додати нарахування</h3></div>
			<form class="add-row" (submit)="add($event, serviceSel.value, qty.value, price.value, date.value)">
				<label class="f">
					Послуга
					<select #serviceSel [disabled]="readOnly()" (change)="pick(serviceSel.value)">
						@for (s of services; track s.name) {
							<option [value]="s.name">{{ s.name }}</option>
						}
					</select>
				</label>
				<label class="f">
					Кількість
					<input #qty type="number" min="1" max="99" value="1" [disabled]="readOnly()" />
				</label>
				<label class="f">
					Ціна, ₴
					<input #price type="number" min="0" step="0.01" [value]="unitPrice()" [disabled]="readOnly()" />
				</label>
				<label class="f">
					Дата
					<input #date type="date" [value]="booking().checkIn" [disabled]="readOnly()" />
				</label>
				<button type="submit" class="btn primary" [disabled]="readOnly()">Додати</button>
			</form>
			@if (error()) {
				<p class="hint" role="alert">{{ error() }}</p>
			}
		</section>
	`,
})
export class ChargesTabComponent {
	protected readonly store = inject(BookingDemoStore);
	readonly booking = input.required<BookingRecord>();
	readonly readOnly = input(false);

	protected readonly money = money;
	protected readonly day = dayLabel;
	protected readonly services = SERVICES;
	protected readonly error = signal('');
	private readonly _picked = signal(SERVICES[0].name);

	protected readonly nights = computed(() => nightsBetween(this.booking().checkIn, this.booking().checkOut));
	protected readonly nightPrice = computed(() => (this.nights() ? this.booking().total / this.nights() : 0));
	protected readonly unitPrice = computed(() => SERVICES.find((s) => s.name === this._picked())?.price ?? 0);

	protected pick(name: string): void {
		this._picked.set(name);
	}

	protected add(event: Event, service: string, qtyRaw: string, priceRaw: string, date: string): void {
		event.preventDefault();
		const qty = Number(qtyRaw);
		const price = Number(priceRaw);
		if (!Number.isInteger(qty) || qty < 1 || qty > 99) return void this.error.set('Кількість: ціле число від 1 до 99');
		if (!Number.isFinite(price) || price < 0) return void this.error.set('Ціна: число від 0');
		if (!date) return void this.error.set('Вкажіть дату');
		this.error.set('');
		this.store.addCharge(service, qty, price, date);
	}
}
