import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

type MessageFrom = 'system' | 'hotel' | 'guest';
type MessageStatus = 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
type ConvoContext = 'today' | 'upcoming' | 'former';
type ConvoFilter = 'all' | 'unread' | 'today' | 'upcoming' | 'needsResponse';
type SortMode = 'activity' | 'unread' | 'arrival';

interface Message {
	date: string;
	time: string;
	from: MessageFrom;
	text: string;
	status?: MessageStatus;
	auto?: boolean;
	rule?: string;
	failReason?: string;
}

interface Scheduled {
	date: string;
	time: string;
	text: string;
}

interface Conversation {
	id: number;
	guest: string;
	phone: string;
	email: string;
	room: string;
	roomType: string;
	dates: string;
	status: string;
	payment: string;
	arrival: string;
	balance: number;
	total: number;
	stays: number;
	pref: string;
	context: ConvoContext;
	contextLabel: string;
	unread: number;
	archived: boolean;
	messages: Message[];
	scheduled?: Scheduled | null;
}

interface Template {
	id: string;
	name: string;
	category: string;
	channel: string;
	chip: string;
	text: string;
}

type DialogView =
	| { kind: 'templates' }
	| { kind: 'new-template' }
	| { kind: 'new-message' }
	| { kind: 'convo-menu' }
	| { kind: 'edit-scheduled' }
	| null;

const HOTEL = { name: 'Grand Hotel', checkInTime: '14:00', checkOutTime: '11:00' };

const TEMPLATES: Template[] = [
	{
		id: 'confirm',
		name: 'Підтвердження бронювання',
		category: 'Бронювання',
		channel: 'Email',
		chip: 'Підтвердження',
		text: 'Вітаємо, {{guest.firstName}}!\n\nВаше бронювання в {{hotel.name}} підтверджено.\n\nЗаїзд: {{booking.checkIn}}\nВиїзд: {{booking.checkOut}}\nНомер: {{room.name}}\nСума: {{booking.total}}\n\nБудемо раді вас бачити!',
	},
	{
		id: 'arrival',
		name: 'Перед заїздом',
		category: 'Заїзд',
		channel: 'Email',
		chip: 'Перед заїздом',
		text: 'Вітаємо, {{guest.firstName}}!\n\nНагадуємо, що завтра очікуємо вас у {{hotel.name}}.\nЗаселення доступне після {{hotel.checkInTime}}.\n\nЯкщо вже знаєте приблизний час прибуття, напишіть нам у відповідь.',
	},
	{
		id: 'payment',
		name: 'Нагадування про оплату',
		category: 'Оплата',
		channel: 'SMS',
		chip: 'Оплата',
		text: 'Вітаємо, {{guest.firstName}}!\n\nЗа вашим бронюванням залишилося оплатити {{booking.balance}}.\n\nЯкщо оплату вже здійснено, можете проігнорувати це повідомлення.',
	},
	{
		id: 'checkout',
		name: 'Нагадування про виїзд',
		category: 'Виїзд',
		channel: 'Email',
		chip: 'Check-out',
		text: 'Доброго ранку, {{guest.firstName}}!\n\nНагадуємо, що сьогодні check-out до {{hotel.checkOutTime}}.\n\nДякуємо, що обрали {{hotel.name}}.',
	},
	{
		id: 'thanks',
		name: 'Після проживання',
		category: 'Подяка',
		channel: 'Email',
		chip: 'Подяка',
		text: 'Дякуємо, {{guest.firstName}}, що гостювали у нас!\n\nБудемо раді бачити вас знову. Якщо матимете хвилину, будемо вдячні за ваш відгук.',
	},
	{
		id: 'prepay-dm',
		name: 'Пропозиція номера в месенджері',
		category: 'Продаж',
		channel: 'Telegram',
		chip: 'AI-продаж',
		text: 'Вітаємо! На ці дати вільний номер «{{room.name}}», {{booking.total}}.\n\nЗабронювати й надіслати посилання на передоплату?',
	},
];

const VARIABLES: [string, string][] = [
	['Ім’я гостя', '{{guest.firstName}}'],
	['Назва готелю', '{{hotel.name}}'],
	['Дата заїзду', '{{booking.checkIn}}'],
	['Дата виїзду', '{{booking.checkOut}}'],
	['Номер', '{{room.name}}'],
	['Тип номера', '{{room.type}}'],
	['Сума', '{{booking.total}}'],
	['Залишок', '{{booking.balance}}'],
	['Час check-in', '{{hotel.checkInTime}}'],
	['Час check-out', '{{hotel.checkOutTime}}'],
];

const SEED_CONVERSATIONS: Conversation[] = [
	{
		id: 1842,
		guest: 'Анна Коваленко',
		phone: '+380 67 123 45 67',
		email: 'anna@example.com',
		room: '204',
		roomType: 'Люкс',
		dates: '17–20 вересня',
		status: 'Підтверджено',
		payment: 'Оплачено',
		arrival: '14:30',
		balance: 0,
		total: 4800,
		stays: 4,
		pref: 'Тихий номер',
		context: 'today',
		contextLabel: 'Заїзд сьогодні',
		unread: 2,
		archived: false,
		messages: [
			{ date: '14 вересня', time: '12:11', from: 'system', text: 'Бронювання підтверджено' },
			{
				date: '14 вересня',
				time: '12:14',
				from: 'hotel',
				text: `Вітаємо, Анно!\n\nВаше бронювання в ${HOTEL.name} підтверджено.\n\n17–20 вересня\n204 · Люкс\n4 800 ₴`,
				status: 'read',
			},
			{ date: '14 вересня', time: '12:19', from: 'guest', text: 'Дякую!' },
			{ date: '14 вересня', time: '12:20', from: 'system', text: 'Отримано оплату 2 000 ₴' },
			{
				date: '16 вересня',
				time: '14:00',
				from: 'hotel',
				text: 'Вітаємо, Анно! Нагадуємо, що завтра очікуємо вас у Grand Hotel. Заселення доступне після 14:00.',
				status: 'read',
				auto: true,
				rule: 'За 24 години до заїзду',
			},
			{ date: '17 вересня', time: '09:05', from: 'system', text: 'Час заїзду змінено на 13:30' },
			{ date: '17 вересня', time: '10:04', from: 'hotel', text: 'Доброго дня! Підкажіть, будь ласка, приблизний час вашого прибуття.', status: 'read' },
			{ date: '17 вересня', time: '10:11', from: 'guest', text: 'Будемо приблизно о 14:30.' },
			{ date: '17 вересня', time: '12:42', from: 'guest', text: 'Дякую, будемо приблизно о 14:30.' },
		],
	},
	{
		id: 1847,
		guest: 'Олег Бондар',
		phone: '+380 50 222 11 33',
		email: '',
		room: '103',
		roomType: 'Стандарт',
		dates: '17–18 вересня',
		status: 'Підтверджено',
		payment: 'Частково оплачено',
		arrival: '-',
		balance: 1200,
		total: 3200,
		stays: 1,
		pref: '',
		context: 'today',
		contextLabel: 'Очікується оплата',
		unread: 0,
		archived: false,
		messages: [
			{ date: '17 вересня', time: '09:14', from: 'system', text: 'Отримано передоплату 1 500 ₴' },
			{ date: '17 вересня', time: '11:15', from: 'hotel', text: 'Нагадуємо про залишок оплати 1 200 ₴.', status: 'sent' },
			{
				date: '17 вересня',
				time: '11:16',
				from: 'hotel',
				text: 'Ваш рахунок на email надіслано.',
				status: 'failed',
				failReason: 'Email адреса недоступна.',
			},
		],
	},
	{
		id: 1853,
		guest: 'Марія Петренко',
		phone: '+380 63 456 78 90',
		email: 'maria@example.com',
		room: '202',
		roomType: 'Люкс',
		dates: '20–23 вересня',
		status: 'Підтверджено',
		payment: 'Оплачено',
		arrival: '-',
		balance: 0,
		total: 7200,
		stays: 8,
		pref: 'Високий поверх',
		context: 'upcoming',
		contextLabel: 'Заїзд через 3 дні',
		unread: 0,
		archived: false,
		messages: [{ date: '16 вересня', time: '17:40', from: 'hotel', text: 'Ваше бронювання підтверджено.', status: 'read' }],
	},
	{
		id: 1858,
		guest: 'Наталія Коваль',
		phone: '+380 97 555 66 77',
		email: 'natalia@example.com',
		room: '203',
		roomType: 'Люкс',
		dates: '18–21 вересня',
		status: 'Підтверджено',
		payment: 'Частково оплачено',
		arrival: '-',
		balance: 2200,
		total: 5200,
		stays: 5,
		pref: 'Ранній заїзд',
		context: 'upcoming',
		contextLabel: 'Заїзд завтра',
		unread: 1,
		archived: false,
		messages: [
			{ date: '16 вересня', time: '10:00', from: 'hotel', text: 'Вітаємо, Наталіє! Ваше бронювання підтверджено.', status: 'read' },
			{ date: '17 вересня', time: '09:30', from: 'guest', text: 'Чи можливий ранній заїзд, орієнтовно о 11:00?' },
		],
		scheduled: { date: 'Завтра', time: '10:00', text: 'Інструкція перед заїздом' },
	},
	{
		id: 1690,
		guest: 'Тарас Гончар',
		phone: '+380 66 777 88 99',
		email: '',
		room: '101',
		roomType: 'Стандарт',
		dates: '5–8 вересня',
		status: 'Виїхав',
		payment: 'Оплачено',
		arrival: '-',
		balance: 0,
		total: 2400,
		stays: 1,
		pref: '',
		context: 'former',
		contextLabel: 'Колишній гість',
		unread: 0,
		archived: false,
		messages: [{ date: '8 вересня', time: '11:20', from: 'hotel', text: 'Дякуємо, Тарасе, що гостювали у нас! Будемо раді бачити вас знову.', status: 'read' }],
	},
];

const MONTHS: Record<string, string> = { вересня: '09', серпня: '08', грудня: '12' };

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';

const dateToMD = (label: string): string => {
	const m = label.match(/(\d+)\s+(\S+)/);
	if (!m) return '09-17';
	const day = m[1].padStart(2, '0');
	const mon = MONTHS[m[2]] || '09';
	return mon + '-' + day;
};

const messageStatusLabel = (s?: MessageStatus): string =>
	({ scheduled: 'Заплановано', sending: 'Надсилається', sent: 'Надіслано', delivered: 'Доставлено', read: 'Прочитано', failed: 'Помилка' })[
		s ?? ('' as MessageStatus)
	] ?? '';

@Component({
	selector: 'app-messages',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './messages.component.html',
	styleUrl: './messages.component.scss',
})
export class MessagesComponent {
	protected readonly TEMPLATES = TEMPLATES;
	protected readonly VARIABLES = VARIABLES;
	protected readonly money = money;
	protected readonly messageStatusLabel = messageStatusLabel;

	protected readonly conversations = signal<Conversation[]>(SEED_CONVERSATIONS.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m })) })));
	protected readonly activeId = signal<number>(SEED_CONVERSATIONS[0].id);
	protected readonly filter = signal<ConvoFilter>('all');
	protected readonly sort = signal<SortMode>('activity');
	protected readonly search = signal('');
	protected readonly chatOpen = signal(false);

	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly formError = signal('');

	protected readonly composerText = signal('');
	protected readonly channel = signal('Email');
	protected readonly aiPopoverOpen = signal(false);

	protected readonly newMessageRecipient = signal('');
	protected readonly newMessageTemplate = signal('');
	protected readonly newMessageText = signal('');
	protected readonly newTemplateText = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly activeConvo = computed(() => this.conversations().find((c) => c.id === this.activeId()));

	protected readonly filteredConvos = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		let list = this.conversations().filter((c) => !c.archived);
		if (q) list = list.filter((c) => (c.guest + ' #' + c.id + ' ' + c.room).toLocaleLowerCase('uk-UA').includes(q));
		const f = this.filter();
		if (f === 'unread') list = list.filter((c) => c.unread > 0);
		else if (f === 'today') list = list.filter((c) => this.isToday(c));
		else if (f === 'upcoming') list = list.filter((c) => c.context === 'upcoming');
		else if (f === 'needsResponse') list = list.filter((c) => this.needsResponse(c));

		const sorters: Record<SortMode, (a: Conversation, b: Conversation) => number> = {
			activity: (a, b) => {
				const la = this.lastMessage(a);
				const lb = this.lastMessage(b);
				return (
					new Date('2026-' + dateToMD(lb.date) + 'T' + lb.time).getTime() - new Date('2026-' + dateToMD(la.date) + 'T' + la.time).getTime()
				);
			},
			unread: (a, b) => b.unread - a.unread,
			arrival: (a, b) => this.contextOrder(a) - this.contextOrder(b),
		};
		return list.slice().sort(sorters[this.sort()]);
	});

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
	protected readonly chatBodyRef = viewChild<ElementRef<HTMLDivElement>>('chatBody');

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

		effect(() => {
			this.activeConvo();
			const body = this.chatBodyRef()?.nativeElement;
			if (body) queueMicrotask(() => (body.scrollTop = body.scrollHeight));
		});
	}

	private contextOrder(c: Conversation): number {
		return c.context === 'today' ? 0 : c.context === 'upcoming' ? 1 : 2;
	}

	protected lastMessage(c: Conversation): Message {
		return c.messages[c.messages.length - 1];
	}

	protected needsResponse(c: Conversation): boolean {
		const l = this.lastMessage(c);
		return !!l && l.from === 'guest';
	}

	protected isToday(c: Conversation): boolean {
		return c.messages.some((m) => m.date === '17 вересня') || c.context === 'today';
	}

	protected previewText(c: Conversation): string {
		const l = this.lastMessage(c);
		return l.from === 'system' ? l.text : l.text.split('\n')[0];
	}

	protected fillTemplate(tpl: Template, c: Conversation): string {
		const firstName = c.guest.split(' ')[0];
		return tpl.text
			.replace(/{{guest.firstName}}/g, firstName)
			.replace(/{{hotel.name}}/g, HOTEL.name)
			.replace(/{{hotel.checkInTime}}/g, HOTEL.checkInTime)
			.replace(/{{hotel.checkOutTime}}/g, HOTEL.checkOutTime)
			.replace(/{{booking.checkIn}}/g, c.dates.split('–')[0] + ' вересня')
			.replace(/{{booking.checkOut}}/g, c.dates)
			.replace(/{{room.name}}/g, c.room + ' · ' + c.roomType)
			.replace(/{{room.type}}/g, c.roomType)
			.replace(/{{booking.total}}/g, money(c.total))
			.replace(/{{booking.balance}}/g, money(c.balance));
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected openConvo(id: number): void {
		this.activeId.set(id);
		this.conversations.update((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
		this.chatOpen.set(true);
	}

	protected closeChat(): void {
		this.chatOpen.set(false);
	}

	protected setFilter(f: ConvoFilter): void {
		this.filter.set(f);
	}

	protected openDialog(view: DialogView): void {
		this.formError.set('');
		this.dialogView.set(view);
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	protected sendMessage(): void {
		const text = this.composerText().trim();
		if (!text) return;
		const id = this.activeId();
		this.conversations.update((cs) =>
			cs.map((c) =>
				c.id === id
					? { ...c, messages: [...c.messages, { date: '17 вересня', time: new Date().toTimeString().slice(0, 5), from: 'hotel', text, status: 'sent' }] }
					: c,
			),
		);
		this.composerText.set('');
		this.toast('Повідомлення надіслано');
	}

	protected onComposerKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			this.sendMessage();
		}
	}

	protected insertTemplate(id: string): void {
		const t = TEMPLATES.find((x) => x.id === id);
		const c = this.activeConvo();
		if (!t || !c) return;
		this.composerText.set(this.fillTemplate(t, c));
	}

	protected toggleAiPopover(): void {
		this.aiPopoverOpen.update((v) => !v);
	}

	protected aiSuggest(action: string): void {
		const c = this.activeConvo();
		if (!c) return;
		const lastGuestMsg = [...c.messages].reverse().find((m) => m.from === 'guest');
		const late = !!lastGuestMsg && /23:00|пізн/i.test(lastGuestMsg.text);
		const current = this.composerText();
		const map: Record<string, string> = {
			reply: late
				? `Вітаємо, ${c.guest.split(' ')[0]}!\n\nТак, пізнє заселення можливе. Ми очікуватимемо вас приблизно о 23:00 та надішлемо необхідні інструкції перед прибуттям.\n\nГарної дороги!`
				: `Доброго дня, ${c.guest.split(' ')[0]}! Дякуємо за повідомлення, ми врахували цю інформацію.`,
			shorter: current ? current.split('.').slice(0, 1).join('.') + '.' : 'Дякуємо, врахували.',
			polite: 'Щиро дякуємо за ваше повідомлення! ' + (current || 'Будемо раді допомогти.'),
			translate: '[EN] Thank you for your message. We will be happy to help.',
			payment: this.fillTemplate(TEMPLATES.find((t) => t.id === 'payment')!, c),
			arrival: this.fillTemplate(TEMPLATES.find((t) => t.id === 'arrival')!, c),
		};
		this.composerText.set(map[action] || '');
		this.aiPopoverOpen.set(false);
	}

	protected attachFile(): void {
		this.toast('Додавання вкладень: демо');
	}

	protected retrySend(): void {
		this.toast('Повторна спроба надсилання...');
	}

	protected changeFailedChannel(): void {
		this.toast('Канал змінено на SMS · Демо');
	}

	protected callGuest(): void {
		const c = this.activeConvo();
		if (c) this.toast('Дзвінок демо: ' + c.phone);
	}

	protected markUnread(): void {
		this.conversations.update((cs) => cs.map((c) => (c.id === this.activeId() ? { ...c, unread: 1 } : c)));
		this.closeDialog();
		this.toast('Позначено непрочитаним');
	}

	protected archiveConvo(): void {
		const id = this.activeId();
		this.conversations.update((cs) => cs.map((c) => (c.id === id ? { ...c, archived: true } : c)));
		this.closeDialog();
		const next = this.conversations().find((c) => !c.archived);
		if (next) this.activeId.set(next.id);
		this.toast('Розмову архівовано');
	}

	protected cancelScheduled(): void {
		const id = this.activeId();
		this.conversations.update((cs) => cs.map((c) => (c.id === id ? { ...c, scheduled: null } : c)));
		this.toast('Заплановане повідомлення скасовано');
	}

	protected submitEditScheduled(text: string): void {
		const id = this.activeId();
		this.conversations.update((cs) =>
			cs.map((c) => (c.id === id && c.scheduled ? { ...c, scheduled: { ...c.scheduled, text } } : c)),
		);
		this.closeDialog();
		this.toast('Заплановане повідомлення оновлено');
	}

	protected onNewMessageTemplateChange(id: string): void {
		this.newMessageTemplate.set(id);
		const tpl = TEMPLATES.find((t) => t.id === id);
		const guestName = this.newMessageRecipient().trim();
		const convo = this.conversations().find((c) => c.guest === guestName) ?? this.conversations()[0];
		this.newMessageText.set(tpl ? this.fillTemplate(tpl, convo) : '');
	}

	protected submitNewMessage(): void {
		this.closeDialog();
		this.newMessageRecipient.set('');
		this.newMessageTemplate.set('');
		this.newMessageText.set('');
		this.toast('Повідомлення надіслано · Демо');
	}

	protected insertVariable(token: string): void {
		this.newTemplateText.update((t) => t + token);
	}

	protected submitNewTemplate(): void {
		this.closeDialog();
		this.newTemplateText.set('');
		this.toast('Шаблон збережено · Демо');
	}
}
