import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon.component';

type ViewState = 'new' | 'return' | 'paid' | 'pending' | 'failed' | 'staying' | 'done' | 'cancelled' | 'invalid';
type ModalKind = 'arrival' | 'request' | 'contact' | null;
type PaymentKind = 'normal' | 'paid' | 'pending' | 'failed';

const HOTEL = {
	name: 'Grand Hotel',
	address: 'вул. Старобульварна, 10, Кам’янець-Подільський',
	phone: '+380 67 123 45 67',
	email: 'hotel@example.com',
	checkIn: '14:00',
	checkOut: '11:00',
	reception: '08:00–23:00',
	breakfast: '08:00–10:00',
	wifi: 'GrandHotel',
};

const BOOKING = {
	id: 1842,
	guestFirst: 'Анна',
	guest: 'Анна Коваленко',
	start: '17 вересня',
	end: '20 вересня',
	year: '2026',
	nights: 3,
	adults: 2,
	roomType: 'Люкс',
	roomNumber: '204',
	capacity: 2,
	area: 28,
	beds: '1 двоспальне ліжко',
	features: ['Wi-Fi', 'Кондиціонер', 'Сніданок', 'Балкон'],
	total: 4800,
	paid: 1500,
	deposit: 1500,
	cancellation: 'Безкоштовно до 48 годин до заїзду.',
};

const ARRIVAL_OPTIONS = ['До 14:00', '14:00–16:00', '16:00–18:00', '18:00–22:00', 'Після 22:00', 'Ще не знаю'];
const REQUEST_TAGS = ['Тихий номер', 'Дитяче ліжечко', 'Ранній заїзд', 'Пізній заїзд'];

function money(n: number): string {
	return new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
}

@Component({
	selector: 'app-confirmation',
	imports: [FormsModule, RouterLink, IconComponent, NgTemplateOutlet],
	templateUrl: './confirmation.component.html',
	styleUrl: './confirmation.component.scss',
})
export class ConfirmationComponent {
	protected readonly hotel = HOTEL;
	protected readonly booking = BOOKING;
	protected readonly money = money;
	protected readonly arrivalOptions = ARRIVAL_OPTIONS;
	protected readonly requestTags = REQUEST_TAGS;

	/** Demo state switcher — hidden for client-facing use, kept for internal demoing of every booking status. */
	protected readonly showDemoBar = false;

	protected readonly view = signal<ViewState>('return');
	protected readonly arrivalTime = signal<string>('14:30');
	protected readonly prefs = signal<string[]>(['Тихий номер']);

	protected readonly modal = signal<ModalKind>(null);
	protected readonly pickedArrivalOption = signal<string | null>(null);
	protected readonly exactArrivalTime = signal('');
	protected readonly activeReqTags = signal<Set<string>>(new Set());
	protected readonly requestText = signal('');

	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly effectivePaid = computed(() => {
		const v = this.view();
		if (v === 'paid') return this.booking.total;
		if (v === 'failed' || v === 'pending') return 0;
		return this.booking.paid;
	});

	protected readonly balance = computed(() => this.booking.total - this.effectivePaid());

	protected readonly headerKind = computed(() => {
		const v = this.view();
		return v === 'new' ? 'confirmed' : v === 'staying' ? 'staying' : 'return';
	});

	protected readonly paymentKind = computed<PaymentKind>(() => {
		const v = this.view();
		if (v === 'paid') return 'paid';
		if (v === 'pending') return 'pending';
		if (v === 'failed') return 'failed';
		return 'normal';
	});

	protected readonly paymentStatusLabel = computed(() => {
		const kind = this.paymentKind();
		if (kind === 'pending') return 'Перевіряємо оплату';
		if (kind === 'failed') return 'Оплату не завершено';
		return this.balance() <= 0 ? 'Оплачено повністю' : 'Частково оплачено';
	});

	protected readonly paymentNote = computed(() => {
		const kind = this.paymentKind();
		if (kind === 'pending') {
			return 'Номер утримано за вами, поки перевіряється оплата (зазвичай кілька секунд). Бронювання ще не підтверджено остаточно.';
		}
		if (kind === 'failed') {
			return 'Номер НЕ заброньовано — оплату не було завершено, тому місце не утримується. Спробуйте оплатити ще раз або зв’яжіться з готелем, щоб утримати номер іншим способом.';
		}
		if (this.balance() <= 0) return 'Додаткових платежів за проживання не очікується.';
		return 'Залишок можна оплатити під час заселення.';
	});

	protected readonly showStickyPay = computed(() => this.view() === 'return' && this.balance() > 0);

	protected readonly showModifyAndUpcoming = computed(() => this.view() !== 'staying');

	protected readonly timelinePaidDone = computed(() => this.booking.paid > 0);

	protected setView(view: ViewState | string): void {
		this.view.set(view as ViewState);
	}

	protected telHref(): string {
		return 'tel:' + this.hotel.phone.replace(/\s/g, '');
	}

	/* dialogs */

	protected openArrivalModal(): void {
		this.pickedArrivalOption.set(null);
		this.exactArrivalTime.set('');
		this.modal.set('arrival');
	}

	protected pickArrivalOption(option: string): void {
		this.pickedArrivalOption.set(option);
	}

	protected saveArrival(): void {
		const picked = this.exactArrivalTime() || this.pickedArrivalOption() || 'Ще не знаю';
		this.arrivalTime.set(picked);
		this.closeModal();
		this.showToast('Час прибуття збережено. Рецепція вже бачить оновлення.');
	}

	protected openRequestModal(): void {
		this.activeReqTags.set(new Set());
		this.requestText.set('');
		this.modal.set('request');
	}

	protected toggleReqTag(tag: string): void {
		const next = new Set(this.activeReqTags());
		if (next.has(tag)) next.delete(tag);
		else next.add(tag);
		this.activeReqTags.set(next);
	}

	protected saveRequest(): void {
		const chosen = [...this.activeReqTags()];
		if (chosen.length) {
			this.prefs.update((current) => {
				const next = [...current];
				for (const tag of chosen) if (!next.includes(tag)) next.push(tag);
				return next;
			});
		}
		this.closeModal();
		this.showToast('Побажання надіслано готелю');
	}

	protected openContactModal(): void {
		this.modal.set('contact');
	}

	protected closeModal(): void {
		this.modal.set(null);
	}

	/* toast-only demo actions */

	protected messageHotel(): void {
		this.closeModal();
		this.showToast('Функція повідомлень доступна незабаром');
	}

	protected roomDetails(): void {
		this.showToast('Детальна сторінка номера ще у розробці в демо');
	}

	protected payBalance(): void {
		this.showToast('Перенаправлення на безпечну оплату... (демо)');
	}

	protected refreshPaymentStatus(): void {
		this.showToast('Статус оплати оновлено (демо)');
	}

	protected openMap(): void {
		this.showToast('Карти ще у розробці в демо');
	}

	protected fullRules(): void {
		this.showToast('Повні правила бронювання ще у розробці в демо');
	}

	protected addToCalendar(): void {
		this.showToast('Подію додано до календаря (демо .ics)');
	}

	protected saveConfirmation(): void {
		this.showToast('Підтвердження збережено');
	}

	protected async share(): Promise<void> {
		const nav = typeof navigator === 'undefined' ? undefined : navigator;
		if (nav?.share) {
			try {
				await nav.share({ title: 'Моє бронювання — Grand Hotel', text: `Бронювання #${this.booking.id}`, url: location.href });
			} catch {
				/* user cancelled share */
			}
		} else {
			this.showToast('Посилання скопійовано (демо)');
		}
	}

	protected leaveReview(): void {
		this.showToast('Форма відгуку ще у розробці в демо');
	}

	private showToast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
