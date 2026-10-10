import { Component, computed, inject, input, signal } from '@angular/core';
import type { BookingRecord } from '../../../feature/firebase/bookings.service';
import { nightsBetween } from '../../../shared/booking-rules';
import { BookingDemoStore } from '../booking-card.demo';
import { money } from './format';

export type DocumentKind = 'registration' | 'confirmation' | 'cancellation';

const HOTEL = { name: 'Grand Hotel', place: "Кам'янець-Подільський", address: 'вул. Вигадана, 1', phone: '+380 00 000 00 00', email: 'info@grandhotel.example' };

const TITLE: Record<DocumentKind, { ua: string; en: string; subject: string }> = {
	registration: { ua: 'Реєстраційна картка', en: 'Registration card', subject: 'Реєстраційна картка' },
	confirmation: { ua: 'Підтвердження бронювання', en: 'Reservation confirmation', subject: 'Підтвердження бронювання' },
	cancellation: { ua: 'Анулювання бронювання', en: 'Reservation cancellation', subject: 'Анулювання бронювання' },
};

/** Demo tab: a document for the guest filled from the booking, with a pretend e-mail send. Nothing leaves the page. */
@Component({
	selector: 'app-booking-document',
	styleUrl: './tab-panel.scss',
	template: `
		@if (kind() !== 'registration') {
			<section class="panel">
				<div class="panel-head"><h3>Надіслати гостю</h3></div>
				<form class="add-row" (submit)="send($event, email.value, subject.value)">
					<label class="f">
						Електронна пошта
						<input #email type="email" [value]="booking().email" />
					</label>
					<label class="f">
						Тема листа
						<input #subject [value]="title().subject" />
					</label>
					<button type="submit" class="btn primary">Надіслати</button>
				</form>
				@if (status()) {
					<p class="hint" role="status">{{ status() }}</p>
				}
			</section>
		}

		<article class="doc">
			<header>
				<div>
					<strong>{{ hotel.name }}</strong>
					<div>{{ hotel.place }}, {{ hotel.address }}</div>
				</div>
				<div class="right">
					<div>{{ hotel.phone }}</div>
					<div>{{ hotel.email }}</div>
				</div>
			</header>
			<h2>{{ title().ua }} / {{ title().en }}</h2>

			@switch (kind()) {
				@case ('registration') {
					<table>
						<tbody>
							<tr><th>Номер / Room</th><td>{{ booking().roomNumber }}</td><th>Гостей / Guests</th><td>{{ booking().guests }}</td></tr>
							<tr><th>Заїзд / Arrival</th><td>{{ booking().checkIn }} {{ booking().checkInTime }}</td><th>Виїзд / Departure</th><td>{{ booking().checkOut }} {{ booking().checkOutTime }}</td></tr>
							<tr><th>Ночей / Nights</th><td>{{ nights() }}</td><th>Тариф / Rate</th><td>{{ booking().rate }}</td></tr>
							<tr><th>ПІБ / Guest name</th><td>{{ fullName() }}</td><th>Документ / Document</th><td>{{ guest()?.documentType }} {{ guest()?.documentNumber }}</td></tr>
							<tr><th>Телефон / Phone</th><td>{{ booking().phone }}</td><th>Пошта / E-mail</th><td>{{ booking().email }}</td></tr>
							<tr><th>Адреса / Address</th><td colspan="3">{{ guest()?.city }}, {{ guest()?.address }}</td></tr>
						</tbody>
					</table>
					<p class="small">Розрахункова година {{ booking().checkOutTime }} · Check-out time {{ booking().checkOutTime }}. Заселення з {{ booking().checkInTime }} · Check-in from {{ booking().checkInTime }}.</p>
					<div class="sign"><span>Підпис гостя / Guest signature</span><span>Адміністратор / Receptionist</span></div>
				}
				@case ('confirmation') {
					<p>Дякуємо, що обрали {{ hotel.name }}. Підтверджуємо ваше бронювання: / Thank you for choosing {{ hotel.name }}. We confirm your reservation:</p>
					<table>
						<tbody>
							<tr><th>Бронювання для / For</th><td>{{ fullName() }}</td></tr>
							<tr><th>Номер бронювання / Reservation №</th><td>{{ number() }}</td></tr>
							<tr><th>Період / Period</th><td>{{ booking().checkIn }} {{ booking().checkInTime }} – {{ booking().checkOut }} {{ booking().checkOutTime }}</td></tr>
							<tr><th>Ночей / Nights</th><td>{{ nights() }}</td></tr>
							<tr><th>Номер / Room</th><td>{{ booking().roomNumber }}</td></tr>
							<tr><th>Гостей / Guests</th><td>{{ booking().adults }} + {{ booking().children }}</td></tr>
							<tr><th>Харчування / Meals</th><td>{{ booking().mealPlan }}</td></tr>
							<tr><th>Проживання / Accommodation</th><td>{{ money(booking().total) }}</td></tr>
							<tr><th>Сплачено / Paid</th><td>{{ money(booking().paid) }}</td></tr>
						</tbody>
					</table>
					<p class="small">Безкоштовне скасування за 3 доби до заїзду. Free cancellation up to 3 days before arrival.</p>
				}
				@case ('cancellation') {
					<p>Повідомляємо, що бронювання було анульоване. / We inform you that your reservation has been cancelled.</p>
					<table>
						<tbody>
							<tr><th>Гість / Guest</th><td>{{ fullName() }}</td></tr>
							<tr><th>Номер підтвердження / Confirmation №</th><td>{{ number() }}</td></tr>
							<tr><th>Період / Period</th><td>{{ booking().checkIn }} – {{ booking().checkOut }}</td></tr>
							<tr><th>Ночей / Nights</th><td>{{ nights() }}</td></tr>
							<tr><th>Штраф / Penalty (1 ніч / night)</th><td>{{ money(penalty()) }}</td></tr>
							<tr><th>Сплачено / Paid</th><td>{{ money(booking().paid) }}</td></tr>
							<tr><th>До повернення / To refund</th><td>{{ money(refund()) }}</td></tr>
						</tbody>
					</table>
					<p class="small">Це лише попередній перегляд: бронювання не скасовується. This is a preview only; the reservation is not cancelled.</p>
				}
			}
		</article>
	`,
})
export class DocumentTabComponent {
	private readonly _store = inject(BookingDemoStore);
	readonly kind = input.required<DocumentKind>();
	readonly booking = input.required<BookingRecord>();

	protected readonly hotel = HOTEL;
	protected readonly money = money;
	protected readonly status = signal('');

	protected readonly title = computed(() => TITLE[this.kind()]);
	protected readonly nights = computed(() => nightsBetween(this.booking().checkIn, this.booking().checkOut));
	protected readonly number = computed(() => this.booking().id.replace('demo-', ''));
	protected readonly guest = computed(() => this._store.guests().find((g) => g.primary));
	protected readonly fullName = computed(() => this.booking().guestName);
	protected readonly penalty = computed(() => (this.nights() ? Math.round(this.booking().total / this.nights()) : 0));
	protected readonly refund = computed(() => Math.max(0, this.booking().paid - this.penalty()));

	protected send(event: Event, email: string, subject: string): void {
		event.preventDefault();
		if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void this.status.set('Перевірте адресу пошти');
		this.status.set(`Демо: лист «${subject}» не надсилається, але записано в історію.`);
		this._store.log(`Надіслано гостю: «${subject}» на ${email.trim()}`);
	}
}
