import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent } from '../../shared/role';

type PaymentType = 'Оплата' | 'Передоплата' | 'Доплата' | 'Повернення';
type PaymentStatus = 'success' | 'refunded';
type Tab = 'all' | 'pending' | 'partial' | 'success' | 'refunded';
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'lastmonth' | 'custom';

interface Payment {
	id: number;
	date: string;
	time: string;
	guest: string;
	bookingId: number;
	room: string;
	roomType: string;
	type: PaymentType;
	method: string;
	amount: number;
	status: PaymentStatus;
	note: string;
	createdBy: string;
	dates: string;
}

interface Outstanding {
	bookingId: number;
	guest: string;
	room: string;
	roomType: string;
	dates: string;
	total: number;
	paid: number;
	checkin: string;
	staying: boolean;
}

type DialogView =
	| { kind: 'add-payment'; forcedBookingId: number | null }
	| { kind: 'refund'; paymentId: number }
	| { kind: 'reassign'; paymentId: number }
	| { kind: 'note'; paymentId: number }
	| { kind: 'reminder'; bookingId: number }
	| null;

const TODAY = '2026-09-17';
const MS = 86400000;

const METHODS = ['Готівка', 'Картка на місці', 'Банківський переказ', 'Оплата онлайн', 'Інше'];
const TYPES: PaymentType[] = ['Оплата', 'Передоплата', 'Доплата', 'Повернення'];

const SEED_PAYMENTS: Payment[] = [
	{ id: 1, date: '2026-09-17', time: '10:42', guest: 'Анна Коваленко', bookingId: 1842, room: '204', roomType: 'Люкс', type: 'Доплата', method: 'Картка на місці', amount: 1800, status: 'success', note: 'Оплата при заселенні.', createdBy: 'Олександр', dates: '17–20 вересня' },
	{ id: 2, date: '2026-09-17', time: '09:14', guest: 'Олег Бондар', bookingId: 1847, room: '103', roomType: 'Стандарт', type: 'Передоплата', method: 'Банківський переказ', amount: 1500, status: 'success', note: '', createdBy: 'Олександр', dates: '17–18 вересня' },
	{ id: 3, date: '2026-09-17', time: '08:40', guest: 'Максим Ткаченко', bookingId: 1855, room: '106', roomType: 'Покращений', type: 'Оплата', method: 'Готівка', amount: 2000, status: 'success', note: '', createdBy: 'Марія', dates: '16–19 вересня' },
	{ id: 4, date: '2026-09-17', time: '07:55', guest: 'Дмитро Левченко', bookingId: 1866, room: '112', roomType: 'Покращений', type: 'Оплата', method: 'Оплата онлайн', amount: 5800, status: 'success', note: 'Оплата через сайт бронювання.', createdBy: 'Онлайн', dates: '17–20 вересня' },
	{ id: 5, date: '2026-09-16', time: '18:20', guest: 'Марія Петренко', bookingId: 1812, room: '202', roomType: 'Люкс', type: 'Повернення', method: 'Картка на місці', amount: -2400, status: 'refunded', note: 'Скорочення терміну проживання.', createdBy: 'Олександр', dates: '10–14 вересня' },
	{ id: 6, date: '2026-09-16', time: '11:05', guest: 'Наталія Коваль', bookingId: 1858, room: '203', roomType: 'Люкс', type: 'Передоплата', method: 'Картка на місці', amount: 3000, status: 'success', note: '', createdBy: 'Олександр', dates: '18–21 вересня' },
	{ id: 7, date: '2026-09-15', time: '15:30', guest: 'Андрій Мельник', bookingId: 1860, room: '107', roomType: 'Покращений', type: 'Оплата', method: 'Банківський переказ', amount: 1600, status: 'success', note: '', createdBy: 'Марія', dates: '20–22 вересня' },
	{ id: 8, date: '2026-09-14', time: '12:11', guest: 'Тарас Гончар', bookingId: 1862, room: '101', roomType: 'Стандарт', type: 'Передоплата', method: 'Готівка', amount: 1400, status: 'success', note: '', createdBy: 'Олександр', dates: '22–23 вересня' },
	{ id: 9, date: '2026-09-12', time: '09:40', guest: 'Юлія Савчук', bookingId: 1864, room: '302', roomType: 'Апартаменти', type: 'Оплата', method: 'Картка на місці', amount: 4000, status: 'success', note: '', createdBy: 'Олександр', dates: '24–27 вересня' },
	{ id: 10, date: '2026-09-10', time: '14:00', guest: 'Віктор Коваль', bookingId: 1690, room: '205', roomType: 'Люкс', type: 'Оплата', method: 'Оплата онлайн', amount: 5400, status: 'success', note: '', createdBy: 'Онлайн', dates: '5–8 вересня' },
	{ id: 11, date: '2026-09-08', time: '10:22', guest: 'Олена Романюк', bookingId: 1671, room: '101', roomType: 'Стандарт', type: 'Оплата', method: 'Картка на місці', amount: 3200, status: 'success', note: '', createdBy: 'Олександр', dates: '1–3 вересня' },
	{ id: 12, date: '2026-09-05', time: '17:15', guest: 'Ірина Шевченко', bookingId: 1652, room: '204', roomType: 'Люкс', type: 'Повернення', method: 'Банківський переказ', amount: -1000, status: 'refunded', note: 'Скорочення терміну проживання.', createdBy: 'Олександр', dates: '28–30 серпня' },
];

const SEED_OUTSTANDING: Outstanding[] = [
	{ bookingId: 1847, guest: 'Олег Бондар', room: '103', roomType: 'Стандарт', dates: '17–18 вересня', total: 3200, paid: 2000, checkin: '2026-09-17', staying: false },
	{ bookingId: 1851, guest: 'Ірина Шевченко', room: '205', roomType: 'Люкс', dates: '19–22 вересня', total: 6400, paid: 0, checkin: '2026-09-19', staying: false },
	{ bookingId: 1855, guest: 'Максим Ткаченко', room: '106', roomType: 'Покращений', dates: '16–19 вересня', total: 4000, paid: 2000, checkin: '2026-09-16', staying: true },
	{ bookingId: 1858, guest: 'Наталія Коваль', room: '203', roomType: 'Люкс', dates: '18–21 вересня', total: 5200, paid: 3000, checkin: '2026-09-18', staying: false },
	{ bookingId: 1860, guest: 'Андрій Мельник', room: '107', roomType: 'Покращений', dates: '20–22 вересня', total: 3600, paid: 1600, checkin: '2026-09-20', staying: false },
	{ bookingId: 1862, guest: 'Тарас Гончар', room: '101', roomType: 'Стандарт', dates: '22–23 вересня', total: 2400, paid: 1400, checkin: '2026-09-22', staying: false },
	{ bookingId: 1864, guest: 'Юлія Савчук', room: '302', roomType: 'Апартаменти', dates: '24–27 вересня', total: 6000, paid: 4000, checkin: '2026-09-24', staying: false },
];

const CHART_SEED = [420, 510, 380, 600, 720, 540, 610, 700, 480, 390, 650, 720, 800, 610, 590, 900, 940, 1020, 860, 780, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const dayDiff = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
const shortDate = (s: string) => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toDate(s));
const money = (n: number) => (n < 0 ? '−' : '') + new Intl.NumberFormat('uk-UA').format(Math.abs(n)) + ' ₴';
const remaining = (o: Outstanding) => o.total - o.paid;
const outstandingRank = (o: Outstanding) => (o.staying ? 0 : o.checkin === TODAY ? 1 : dayDiff(TODAY, o.checkin) === 1 ? 2 : 3);
const outstandingStatusLabel = (o: Outstanding) =>
	o.staying ? 'Гість проживає' : o.checkin === TODAY ? 'Заїжджає сьогодні' : dayDiff(TODAY, o.checkin) === 1 ? 'Заїжджає завтра' : 'Майбутнє бронювання';

@Component({
	selector: 'app-payments',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './payments.component.html',
	styleUrl: './payments.component.scss',
})
export class PaymentsComponent {
	protected readonly showReports = canCurrent('financeReports');
	protected readonly canRefund = canCurrent('refundPayment');
	protected readonly pendingApproval = signal<Record<number, string>>({});

	protected readonly TODAY = TODAY;
	protected readonly METHODS = METHODS;
	protected readonly TYPES = TYPES;
	protected readonly CHART_SEED = CHART_SEED;
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly remaining = remaining;
	protected readonly outstandingRank = outstandingRank;
	protected readonly outstandingStatusLabel = outstandingStatusLabel;

	protected readonly payments = signal<Payment[]>(SEED_PAYMENTS.map((p) => ({ ...p })));
	protected readonly outstanding = signal<Outstanding[]>(SEED_OUTSTANDING.map((o) => ({ ...o })));

	protected readonly period = signal<Period>('month');
	protected readonly tab = signal<Tab>('all');
	protected readonly search = signal('');
	protected readonly filterMethods = signal(new Set(METHODS));
	protected readonly filterTypes = signal(new Set<PaymentType>(TYPES));
	protected readonly filtersOpen = signal(false);

	protected readonly selectedPaymentId = signal<number | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly aiAnswerHtml = signal('');

	protected readonly addPaymentSearch = signal('');
	protected readonly addPaymentAmount = signal<number | null>(null);
	protected readonly overpayWarning = signal('');
	protected readonly reminderText = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly filteredPayments = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const methods = this.filterMethods();
		const types = this.filterTypes();
		let list = this.payments().filter((p) => methods.has(p.method) && types.has(p.type));
		if (q) list = list.filter((p) => (p.guest + ' #' + p.bookingId + ' ' + p.room).toLocaleLowerCase('uk-UA').includes(q));
		const tab = this.tab();
		if (tab === 'success') list = list.filter((p) => p.status === 'success' && p.type !== 'Повернення');
		else if (tab === 'refunded') list = list.filter((p) => p.status === 'refunded');
		else if (tab === 'partial') list = list.filter((p) => p.type === 'Передоплата');
		else if (tab === 'pending') list = [];
		return list.slice().sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());
	});

	protected readonly todaysPayments = computed(() => this.payments().filter((p) => p.date === TODAY && p.status === 'success'));
	protected readonly receivedToday = computed(() => this.todaysPayments().reduce((s, p) => s + p.amount, 0));
	protected readonly outstandingTotal = computed(() => this.outstanding().reduce((s, o) => s + remaining(o), 0));
	protected readonly deposits = computed(() => this.payments().filter((p) => p.type === 'Передоплата').reduce((s, p) => s + p.amount, 0));
	protected readonly monthRefunds = computed(() => this.payments().filter((p) => p.status === 'refunded').reduce((s, p) => s + Math.abs(p.amount), 0));
	protected readonly monthReceived = computed(() => this.payments().filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0));

	protected readonly dailyGrid = computed(() => {
		const methods = ['Готівка', 'Картка на місці', 'Банківський переказ', 'Оплата онлайн'];
		const todays = this.todaysPayments();
		return methods.map((m) => ({ method: m, sum: todays.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0) }));
	});

	protected readonly upcoming = computed(() => {
		const list = this.outstanding();
		const upToday = list.filter((o) => o.checkin === TODAY).reduce((s, o) => s + remaining(o), 0);
		const upTomorrow = list.filter((o) => dayDiff(TODAY, o.checkin) === 1).reduce((s, o) => s + remaining(o), 0);
		const upWeek = list.filter((o) => { const d = dayDiff(TODAY, o.checkin); return d >= 0 && d <= 7; }).reduce((s, o) => s + remaining(o), 0);
		return { today: upToday, tomorrow: upTomorrow, week: upWeek };
	});

	protected readonly sortedOutstanding = computed(() => this.outstanding().slice().sort((a, b) => outstandingRank(a) - outstandingRank(b)));

	protected readonly chartBars = computed(() => {
		const max = Math.max(...CHART_SEED, 1);
		return CHART_SEED.map((v, i) => ({ height: Math.max(4, (v / max) * 100), today: i + 1 === 17, label: i + 1 + ' вересня' }));
	});

	protected readonly selectedPayment = computed(() => {
		const id = this.selectedPaymentId();
		return id === null ? undefined : this.payments().find((p) => p.id === id);
	});

	protected readonly addPaymentMatch = computed<Outstanding | null>(() => {
		const view = this.dialogView();
		if (!view || view.kind !== 'add-payment') return null;
		if (view.forcedBookingId !== null) return this.outstanding().find((o) => o.bookingId === view.forcedBookingId) ?? null;
		const q = this.addPaymentSearch().trim().toLocaleLowerCase('uk-UA');
		if (q.length <= 2) return null;
		return this.outstanding().find((o) => (o.guest + ' #' + o.bookingId).toLocaleLowerCase('uk-UA').includes(q)) ?? null;
	});

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

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
			const match = this.addPaymentMatch();
			if (match) this.addPaymentAmount.set(remaining(match));
		});
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected payment(id: number): Payment | undefined {
		return this.payments().find((p) => p.id === id);
	}

	protected outstandingFor(bookingId: number): Outstanding | undefined {
		return this.outstanding().find((o) => o.bookingId === bookingId);
	}

	protected statusLabel(p: Payment): string {
		return p.status === 'refunded' ? 'Повернено' : 'Успішно';
	}

	protected setTab(tab: Tab): void {
		this.tab.set(tab);
	}

	protected setPeriod(period: Period): void {
		this.period.set(period);
		this.toast('Період змінено · Демо');
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleMethodFilter(method: string, checked: boolean): void {
		this.filterMethods.update((set) => {
			const next = new Set(set);
			checked ? next.add(method) : next.delete(method);
			return next;
		});
	}

	protected toggleTypeFilter(type: PaymentType, checked: boolean): void {
		this.filterTypes.update((set) => {
			const next = new Set(set);
			checked ? next.add(type) : next.delete(type);
			return next;
		});
	}

	protected resetFilters(): void {
		this.filterMethods.set(new Set(METHODS));
		this.filterTypes.set(new Set(TYPES));
	}

	protected applyFilters(): void {
		this.filtersOpen.set(false);
	}

	protected exportPayments(): void {
		this.toast('Експорт оплат · Демо');
	}

	protected openPaymentPanel(id: number): void {
		this.selectedPaymentId.set(id);
	}

	protected closeSidePanel(): void {
		this.selectedPaymentId.set(null);
	}

	protected openAddPayment(forcedBookingId: number | null = null): void {
		this.addPaymentSearch.set('');
		this.addPaymentAmount.set(forcedBookingId !== null ? remaining(this.outstanding().find((o) => o.bookingId === forcedBookingId)!) : null);
		this.overpayWarning.set('');
		this.dialogView.set({ kind: 'add-payment', forcedBookingId });
	}

	protected requestApproval(id: number, what: string): void {
		this.pendingApproval.update((m) => ({ ...m, [id]: what }));
		this.toast(`Запит на ${what} надіслано менеджеру`);
	}

	protected openRefund(id: number): void {
		if (!this.canRefund) return;
		this.closeSidePanel();
		this.dialogView.set({ kind: 'refund', paymentId: id });
	}

	protected openReassign(id: number): void {
		if (!this.canRefund) return;
		this.closeSidePanel();
		this.dialogView.set({ kind: 'reassign', paymentId: id });
	}

	protected openNote(id: number): void {
		this.dialogView.set({ kind: 'note', paymentId: id });
	}

	protected openReminder(bookingId: number): void {
		const o = this.outstanding().find((x) => x.bookingId === bookingId);
		if (!o) return;
		this.reminderText.set(`Вітаємо, ${o.guest.split(' ')[0]}!\nНагадуємо, що за вашим бронюванням #${o.bookingId} залишилось оплатити ${money(remaining(o))}.`);
		this.dialogView.set({ kind: 'reminder', bookingId });
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

	protected onAddPaymentAmountInput(value: number): void {
		this.addPaymentAmount.set(value);
		const match = this.addPaymentMatch();
		const rem = match ? remaining(match) : 0;
		if (rem && value > rem) {
			this.overpayWarning.set(`Сума перевищує залишок · Залишок: ${money(rem)} · Введено: ${money(value)} · Різниця: ${money(value - rem)}`);
		} else {
			this.overpayWarning.set('');
		}
	}

	protected aiAnswer(key: string): void {
		const todays = this.todaysPayments();
		const receivedToday = this.receivedToday();
		const monthRefunds = this.monthRefunds();
		const deposits = this.deposits();
		const unpaidToday = this.outstanding().filter((o) => o.checkin === TODAY || o.staying);
		const biggest = this.outstanding().slice().sort((a, b) => remaining(b) - remaining(a))[0];
		const map: Record<string, string> = {
			unpaid: unpaidToday.length
				? unpaidToday.map((o) => `${o.guest}: залишок ${money(remaining(o))}`).join('<br>')
				: 'Сьогодні всі заїзди оплачені.',
			today: `Сьогодні отримано <b>${money(receivedToday)}</b> (${todays.length} платежів).`,
			debt: biggest ? `Найбільший борг: <b>${biggest.guest}</b> · #${biggest.bookingId} · ${money(remaining(biggest))}.` : 'Заборгованостей немає.',
			deposits: `Передоплат зафіксовано на суму <b>${money(deposits)}</b>.`,
			refunds: `Цього місяця повернено <b>${money(monthRefunds)}</b>.`,
		};
		this.aiAnswerHtml.set(`<p>${map[key] ?? 'AI відповідає лише на основі даних оплат.'}</p>`);
	}

	protected rewriteReminder(): void {
		this.reminderText.set('Доброго дня! Ввічливо нагадуємо про залишок оплати за вашим бронюванням. Будемо вдячні, якщо ви зможете внести суму до заїзду.');
	}

	protected submitAddPayment(amount: number, method: string, date: string, note: string): void {
		if (!amount || amount <= 0) {
			this.toast('Вкажіть суму платежу');
			return;
		}
		const match = this.addPaymentMatch();
		if (match && amount > remaining(match)) return;
		const bookingId = match ? match.bookingId : Math.floor(1800 + Math.random() * 200);
		const guest = match ? match.guest : 'Гість';
		const id = Math.max(...this.payments().map((p) => p.id)) + 1;
		const payment: Payment = {
			id,
			date,
			time: new Date().toTimeString().slice(0, 5),
			guest,
			bookingId,
			room: match?.room ?? '-',
			roomType: match?.roomType ?? '',
			type: match && match.paid === 0 ? 'Оплата' : 'Доплата',
			method,
			amount,
			status: 'success',
			note,
			createdBy: 'Олександр',
			dates: match?.dates ?? '',
		};
		this.payments.update((ps) => [payment, ...ps]);
		if (match) {
			this.outstanding.update((os) => {
				const next = os.map((o) => (o.bookingId === match.bookingId ? { ...o, paid: o.paid + amount } : o));
				return next.filter((o) => o.paid < o.total);
			});
		}
		this.closeDialog();
		this.toast('Оплату збережено · ' + money(amount));
	}

	protected submitRefund(): void {
		this.closeDialog();
		this.toast('Повернення оформлено · Демо');
	}

	protected submitReassign(newBookingId: string): void {
		this.closeDialog();
		this.toast('Оплату перепризначено на бронювання #' + newBookingId + ' · Сума в готелі не змінилась · Демо');
	}

	protected submitNote(): void {
		this.closeDialog();
		this.toast('Нотатку збережено');
	}

	protected submitReminder(): void {
		this.closeDialog();
		this.toast('Нагадування надіслано · Демо');
	}
}
