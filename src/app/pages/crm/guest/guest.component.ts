import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

interface Stay {
	dates: string;
	room: string;
	type: string;
	nights: number;
	guests: number;
	total: number;
	status: string;
	source: string;
	payment: string;
	bookingId: number;
}

interface NextStay {
	start: string;
	end: string;
	room: string;
	type: string;
	guests: number;
	total: number;
	status: string;
	bookingId: number;
}

interface Note {
	date: string;
	text: string;
	by: string;
	important: boolean;
}

interface MessageItem {
	date: string;
	text: string;
}

interface Payment {
	date: string;
	amount: number;
	bookingId: number;
	method: string;
}

interface Source {
	name: string;
	count: number;
}

interface Activity {
	date: string;
	text: string;
}

type DialogView =
	| { kind: 'message' }
	| { kind: 'add-note' }
	| { kind: 'add-tag' }
	| { kind: 'add-pref' }
	| { kind: 'merge' }
	| { kind: 'delete' }
	| { kind: 'edit' }
	| { kind: 'all-messages' }
	| { kind: 'all-payments' }
	| null;

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const initials = (n: string) =>
	n
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('');

const MESSAGE_TEMPLATES: Record<string, string> = {
	confirm: 'Вітаємо! Ваше бронювання підтверджено.',
	before: 'Чекаємо на вас незабаром у Grand Hotel.',
	returning: 'Будемо раді бачити вас знову у Grand Hotel!',
	custom: '',
};

const SEED_HISTORY: Stay[] = [
	{ dates: '17–20 серпня 2026', room: '204', type: 'Люкс', nights: 3, guests: 2, total: 4800, status: 'Завершено', source: 'Instagram', payment: 'Оплачено', bookingId: 1764 },
	{ dates: '5–8 травня 2026', room: '202', type: 'Люкс', nights: 3, guests: 2, total: 6200, status: 'Завершено', source: 'Пряме бронювання', payment: 'Оплачено', bookingId: 1694 },
	{ dates: '14–18 грудня 2025', room: '301', type: 'Апартаменти', nights: 4, guests: 3, total: 10400, status: 'Завершено', source: 'Google', payment: 'Оплачено', bookingId: 1502 },
];

const SEED_NOTES: Note[] = [
	{ date: '20 серпня 2026', text: 'Просила тихий номер подалі від ліфта.', by: 'Олександр', important: false },
	{ date: '8 травня 2026', text: 'Може приїхати пізніше 22:00.', by: 'Марія', important: true },
];

const SEED_MESSAGES: MessageItem[] = [
	{ date: '16 вересня · 14:00', text: 'Інструкція перед заїздом' },
	{ date: '14 вересня · 12:14', text: 'Підтвердження бронювання' },
	{ date: '22 серпня · 10:00', text: 'Подяка після проживання' },
];

const SEED_PAYMENTS: Payment[] = [
	{ date: '17 серпня 2026', amount: 4800, bookingId: 1842, method: 'Карта' },
	{ date: '5 травня 2026', amount: 6200, bookingId: 1694, method: 'Банківський переказ' },
];

const SEED_SOURCES: Source[] = [
	{ name: 'Instagram', count: 2 },
	{ name: 'Пряме бронювання', count: 1 },
	{ name: 'Google', count: 1 },
];

const SEED_ACTIVITY: Activity[] = [
	{ date: '14 вересня 2026', text: 'Створено нове бронювання #1842' },
	{ date: '22 серпня 2026', text: 'Надіслано повідомлення після проживання' },
	{ date: '20 серпня 2026', text: 'Завершено бронювання #1764' },
	{ date: '17 серпня 2026', text: 'Отримано оплату 4 800 ₴' },
	{ date: '17 серпня 2026', text: 'Гість заселився в номер 204' },
];

const TAG_OPTIONS = ['VIP', 'Бізнес', 'Сім’я', 'Інше'];

@Component({
	selector: 'app-guest',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './guest.component.html',
	styleUrl: './guest.component.scss',
})
export class GuestComponent {
	protected readonly money = money;
	protected readonly initials = initials;
	protected readonly tagOptions = TAG_OPTIONS;

	protected readonly name = signal('Анна Коваленко');
	protected readonly phone = signal('+380 67 123 45 67');
	protected readonly email = signal('anna@example.com');
	protected readonly tags = signal<string[]>(['Постійний гість', 'Сім’я', 'VIP']);
	protected readonly firstVisit = signal('12 березня 2025');
	protected readonly lastVisit = signal('20 серпня 2026');

	protected readonly nextStay = signal<NextStay | null>({
		start: '17 вересня',
		end: '20 вересня',
		room: '204',
		type: 'Люкс',
		guests: 2,
		total: 4800,
		status: 'Підтверджено',
		bookingId: 1842,
	});

	protected readonly history = signal<Stay[]>(SEED_HISTORY.map((s) => ({ ...s })));
	protected readonly preferences = signal<string[]>(['Тихий номер', 'Високий поверх', 'Пізній заїзд', 'Сніданок']);
	protected readonly notes = signal<Note[]>(SEED_NOTES.map((n) => ({ ...n })));
	protected readonly messages = signal<MessageItem[]>(SEED_MESSAGES.map((m) => ({ ...m })));
	protected readonly payments = signal<Payment[]>(SEED_PAYMENTS.map((p) => ({ ...p })));
	protected readonly sources = signal<Source[]>(SEED_SOURCES.map((s) => ({ ...s })));
	protected readonly activity = signal<Activity[]>(SEED_ACTIVITY.map((a) => ({ ...a })));

	protected readonly stays = computed(() => this.history().length);
	protected readonly totalNights = computed(() => this.history().reduce((s, h) => s + h.nights, 0));
	protected readonly totalSpent = computed(() => this.history().reduce((s, h) => s + h.total, 0));
	protected readonly avgNights = computed(() => (this.stays() ? Math.round(this.totalNights() / this.stays()) : 0));
	protected readonly avgCheck = computed(() => (this.stays() ? Math.round(this.totalSpent() / this.stays()) : 0));
	protected readonly favoriteType = computed(() => {
		const counts: Record<string, number> = {};
		for (const h of this.history()) counts[h.type] = (counts[h.type] || 0) + 1;
		const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
		return sorted.length ? sorted[0][0] : '—';
	});
	protected readonly upcomingCount = computed(() => (this.nextStay() ? 1 : 0));

	protected readonly firstSourceName = computed(() => {
		const list = this.sources();
		return list.length ? list[list.length - 1].name : '';
	});
	protected readonly lastSourceName = computed(() => {
		const list = this.sources();
		return list.length ? list[0].name : '';
	});

	protected readonly moreMenuOpen = signal(false);
	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly aiAnswerHtml = signal('');
	protected readonly aiAnswerShowsOffer = signal(false);

	protected readonly messageChannel = signal<'email' | 'sms'>('email');
	protected readonly messageTemplate = signal<'confirm' | 'before' | 'returning' | 'custom'>('custom');
	protected readonly messageText = signal('');

	constructor() {
		effect(() => {
			const dialog = this.dialogRef()?.nativeElement;
			if (!dialog) return;
			if (this.dialogView() !== null) {
				if (!dialog.open) dialog.showModal();
			} else if (dialog.open) {
				dialog.close();
			}
		});
	}

	protected toggleMoreMenu(): void {
		this.moreMenuOpen.update((v) => !v);
	}

	protected closeMoreMenu(): void {
		this.moreMenuOpen.set(false);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected openDialog(view: DialogView): void {
		this.closeMoreMenu();
		this.aiAnswerHtml.set('');
		this.aiAnswerShowsOffer.set(false);
		if (view?.kind === 'message') {
			this.messageChannel.set('email');
			this.messageTemplate.set('custom');
			this.messageText.set('');
		}
		this.dialogView.set(view);
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	protected setMessageChannel(channel: 'email' | 'sms'): void {
		this.messageChannel.set(channel);
	}

	protected setMessageTemplate(key: 'confirm' | 'before' | 'returning' | 'custom'): void {
		this.messageTemplate.set(key);
		this.messageText.set(MESSAGE_TEMPLATES[key] ?? '');
	}

	protected generateAiMessage(): void {
		this.messageText.set(`Добрий день, ${this.name().split(' ')[0]}! Дякуємо, що обираєте Grand Hotel.`);
	}

	protected callGuest(): void {
		this.toast('Дзвінок демо: ' + this.phone());
	}

	protected goToBooking(): void {
		window.location.href = '/booking/';
	}

	protected goToNewBooking(): void {
		window.location.href = '/new-booking/';
	}

	protected submitMessage(text: string): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		this.messages.update((list) => [{ date: '17 вересня · зараз', text: trimmed.slice(0, 60) }, ...list]);
		this.closeDialog();
		this.toast('Повідомлення надіслано · Демо');
	}

	protected useAiOfferMessage(): void {
		this.openDialog({ kind: 'message' });
		this.messageTemplate.set('returning');
		this.messageText.set(`${MESSAGE_TEMPLATES['returning']} У нас доступні номери категорії «${this.favoriteType()}».`);
	}

	protected submitNote(text: string, important: boolean): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		this.notes.update((list) => [{ date: '17 вересня 2026', text: trimmed, by: 'Олександр', important }, ...list]);
		this.closeDialog();
		this.toast('Нотатку додано');
	}

	protected submitTag(tag: string): void {
		this.tags.update((list) => (list.includes(tag) ? list : [...list, tag]));
		this.closeDialog();
		this.toast('Тег додано');
	}

	protected submitPreference(pref: string): void {
		const trimmed = pref.trim();
		if (!trimmed) return;
		this.preferences.update((list) => [...list, trimmed]);
		this.closeDialog();
		this.toast('Побажання додано');
	}

	protected submitEdit(first: string, last: string, phone: string, email: string, tagsInput: string): void {
		this.name.set((first.trim() + ' ' + last.trim()).trim());
		this.phone.set(phone.trim());
		this.email.set(email.trim());
		this.tags.set(
			tagsInput
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
		);
		this.closeDialog();
		this.toast('Профіль оновлено');
	}

	protected confirmMerge(): void {
		this.closeDialog();
		this.toast('Профілі об’єднано · Демо');
	}

	protected confirmArchive(): void {
		this.closeDialog();
		this.toast('Гостя архівовано · Демо');
	}

	protected confirmDeleteAnyway(): void {
		this.closeDialog();
		this.toast('Гостя видалено · Демо');
	}

	protected aiAnswer(key: 'summary' | 'prefs' | 'last' | 'spent' | 'offer'): void {
		const map: Record<string, string> = {
			summary: `<p>${this.name().split(' ')[0]} проживала у вас <b>${this.stays()}</b> рази.</p><p>Найчастіше обирає номери категорії «${this.favoriteType()}».</p><p>Зазвичай проживає <b>${this.avgNights()} ночі</b>.</p><p>У попередніх бронюваннях просила тихий номер.</p><p>Останній візит — <b>${this.lastVisit()}</b>.</p>`,
			prefs: `<p>${this.preferences().join(', ')}.</p>`,
			last: `<p>Востаннє гість проживав у вас <b>${this.lastVisit()}</b>.</p>`,
			spent: `<p>Загалом гість витратив <b>${money(this.totalSpent())}</b> за ${this.stays()} завершених проживань (без вирахування повернень, без урахування майбутніх передоплат).</p>`,
			offer: `<p>Вітаємо, ${this.name().split(' ')[0]}!</p><p>Будемо раді бачити вас знову. Маємо доступні номери категорії «${this.favoriteType()}», яку ви обирали раніше.</p><p>Якщо плануєте поїздку — із задоволенням підберемо зручні дати.</p>`,
		};
		this.aiAnswerHtml.set(map[key] ?? '<p>Відповідь доступна лише в межах цього профілю.</p>');
		this.aiAnswerShowsOffer.set(key === 'offer');
	}
}
