import { Component, computed, inject, input, signal } from '@angular/core';
import type { BookingRecord } from '../../../../feature/firebase/bookings.service';
import { nightsBetween } from '../../../../shared/booking-rules';
import { BookingDemoStore, PROCEDURES, SERVICES } from '../booking-card.demo';
import { dayLabel, money } from './format';

/** Demo tab: what the guest is charged. Accommodation is automatic; services and hourly procedures are added by hand. */
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
								<td>
									{{ c.service }}
									@if (c.hourly) {
										<span class="chip">процедура</span>
									}
								</td>
								<td>{{ day(c.date) }}@if (c.time) {, {{ c.time }}}</td>
								<td class="num">{{ c.hourly ? c.qty + ' год' : c.qty }}</td>
								<td class="num">{{ money(c.price) }}{{ c.hourly ? ' / год' : '' }}</td>
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

		<section class="panel">
			<div class="panel-head">
				<h3>Додати процедуру</h3>
				<span class="hint">Масаж, СПА, сауна та інше рахуються погодинно</span>
			</div>
			<form class="add-row" (submit)="addProcedure($event, procSel.value, hours.value, hourPrice.value, procDate.value, procTime.value)">
				<label class="f">
					Процедура
					<select #procSel [disabled]="readOnly()" (change)="pickProcedure(procSel.value)">
						@for (p of procedures; track p.name) {
							<option [value]="p.name">{{ p.name }}</option>
						}
					</select>
				</label>
				<label class="f">
					Дата
					<input #procDate type="date" [value]="booking().checkIn" [min]="booking().checkIn" [max]="booking().checkOut" [disabled]="readOnly()" />
				</label>
				<label class="f">
					Початок
					<input #procTime type="time" value="10:00" step="900" [disabled]="readOnly()" />
				</label>
				<label class="f">
					Годин
					<input #hours type="number" min="0.5" max="12" step="0.5" value="1" [disabled]="readOnly()" (input)="procHours.set(+hours.value)" />
				</label>
				<label class="f">
					Ціна за годину, ₴
					<input #hourPrice type="number" min="0" step="0.01" [value]="hourlyPrice()" [disabled]="readOnly()" (input)="procPrice.set(+hourPrice.value)" />
				</label>
				<div class="f">
					Сума
					<output class="static">{{ money(procHours() * procPrice()) }}</output>
				</div>
				<button type="submit" class="btn primary" [disabled]="readOnly()">Додати</button>
			</form>
			@if (procError()) {
				<p class="hint" role="alert">{{ procError() }}</p>
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

	protected readonly procedures = PROCEDURES;
	protected readonly procError = signal('');
	private readonly _pickedProcedure = signal(PROCEDURES[0].name);
	protected readonly hourlyPrice = computed(() => PROCEDURES.find((p) => p.name === this._pickedProcedure())?.price ?? 0);
	/** What the form currently holds, for the live sum. */
	protected readonly procHours = signal(1);
	protected readonly procPrice = signal(PROCEDURES[0].price);

	protected pick(name: string): void {
		this._picked.set(name);
	}

	protected pickProcedure(name: string): void {
		this._pickedProcedure.set(name);
		this.procPrice.set(this.hourlyPrice());
	}

	protected addProcedure(event: Event, service: string, hoursRaw: string, priceRaw: string, date: string, time: string): void {
		event.preventDefault();
		const hours = Number(hoursRaw);
		const price = Number(priceRaw);
		if (!Number.isFinite(hours) || hours < 0.5 || hours > 12 || (hours * 2) % 1 !== 0) return void this.procError.set('Години: від 0,5 до 12, кроком пів години');
		if (!Number.isFinite(price) || price < 0) return void this.procError.set('Ціна: число від 0');
		if (!date || !time) return void this.procError.set('Вкажіть дату й час початку');
		this.procError.set('');
		this.store.addProcedure(service, hours, price, date, time);
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
