import { Injectable, computed, signal } from '@angular/core';
import type { BookingPatch, BookingRecord } from '../../feature/firebase/bookings.service';
import type { RoomRecord } from '../../feature/firebase/rooms.service';
import type { TabId } from './booking-card.fields';

/** The demo's one booking: the same hotel and guest as the other demo pages. All people and amounts are invented. */
export const DEMO_BOOKING_ID = 'demo-1842';

/** A person on the booking, with the fields a guest profile keeps. */
export interface DemoGuest {
	id: string;
	primary: boolean;
	lastName: string;
	firstName: string;
	middleName: string;
	gender: string;
	ageGroup: string;
	birthDate: string;
	phone: string;
	email: string;
	citizenship: string;
	city: string;
	address: string;
	documentType: string;
	documentNumber: string;
	vip: boolean;
	blacklist: boolean;
	consent: boolean;
	notes: string;
	/** Earlier stays at this hotel. */
	stays: number;
}

export interface DemoCharge {
	id: string;
	service: string;
	/** ISO `YYYY-MM-DD`. */
	date: string;
	qty: number;
	price: number;
}

export interface DemoPayment {
	id: string;
	date: string;
	amount: number;
	method: string;
	note: string;
}

export interface DemoTask {
	id: string;
	title: string;
	assignee: string;
	due: string;
	done: boolean;
}

export interface DemoNote {
	id: string;
	author: string;
	at: string;
	text: string;
}

export interface DemoHistory {
	at: string;
	actor: string;
	text: string;
}

export const SERVICES: { name: string; price: number }[] = [
	{ name: 'Сніданок', price: 100 },
	{ name: 'Паркінг, доба', price: 150 },
	{ name: 'Пізній виїзд', price: 500 },
	{ name: 'Трансфер зі станції', price: 400 },
	{ name: 'Дитяче ліжечко', price: 200 },
	{ name: 'Пральня', price: 250 },
];

export const GENDERS = ['Жіноча', 'Чоловіча'];
export const AGE_GROUPS = ['Дорослий', 'Дитина'];
export const DOCUMENT_TYPES = ['Паспорт', 'ID-картка', 'Закордонний паспорт', 'Свідоцтво про народження'];
export const PAYMENT_METHODS = ['Готівка', 'Картка', 'Банківський переказ', 'Онлайн', 'Інше'];
export const STAFF = ['Ірина Лисенко', 'Марія Шевчук', 'Олег Дорошенко'];

/** One row of a list tab: an id plus the tab's columns as text. */
export type RecordRow = { id: string } & Record<string, string>;

export interface RecordColumn {
	key: string;
	label: string;
	kind: 'text' | 'number' | 'money' | 'date' | 'select';
	options?: string[];
	/** Value the add form starts with. */
	initial?: string;
	wide?: boolean;
}

export interface RecordTabDef {
	title: string;
	hint: string;
	columns: RecordColumn[];
	seed: Record<string, string>[];
}

/** The tabs that are plain lists with an add form. Everything in them is invented. */
export const RECORD_TABS: Partial<Record<TabId, RecordTabDef>> = {
	keys: {
		title: 'Ключ-карти',
		hint: 'Картки від дверного замка, видані на цей заїзд',
		columns: [
			{ key: 'lock', label: 'Номер замка', kind: 'text', initial: '204' },
			{ key: 'cards', label: 'Карт', kind: 'number', initial: '1' },
			{ key: 'from', label: 'Дійсна з', kind: 'date', initial: '2026-09-17' },
			{ key: 'to', label: 'Дійсна до', kind: 'date', initial: '2026-09-20' },
			{ key: 'issuedBy', label: 'Видав', kind: 'select', options: STAFF },
			{ key: 'status', label: 'Статус', kind: 'select', options: ['Активна', 'Втрачена', 'Повернена'] },
		],
		seed: [{ lock: '204', cards: '2', from: '2026-09-17', to: '2026-09-20', issuedBy: 'Марія Шевчук', status: 'Активна' }],
	},
	rental: {
		title: 'Прокат',
		hint: 'Речі, видані гостю на час проживання',
		columns: [
			{ key: 'item', label: 'Предмет', kind: 'select', options: ['Дитяче ліжечко', 'Велосипед', 'Фен', 'Зарядний пристрій', 'Парасоля', 'Праска'] },
			{ key: 'qty', label: 'Кількість', kind: 'number', initial: '1' },
			{ key: 'issued', label: 'Видано', kind: 'date', initial: '2026-09-17' },
			{ key: 'due', label: 'Повернути до', kind: 'date', initial: '2026-09-20' },
			{ key: 'deposit', label: 'Застава, ₴', kind: 'money', initial: '0' },
			{ key: 'status', label: 'Статус', kind: 'select', options: ['Видано', 'Повернено'] },
		],
		seed: [{ item: 'Дитяче ліжечко', qty: '1', issued: '2026-09-17', due: '2026-09-20', deposit: '0', status: 'Видано' }],
	},
	expenses: {
		title: 'Розходи по бронюванню',
		hint: 'Що готель витратив на цього гостя; у рахунок гостя не потрапляє',
		columns: [
			{ key: 'date', label: 'Дата', kind: 'date', initial: '2026-09-17' },
			{ key: 'item', label: 'Стаття', kind: 'select', options: ['Квіти в номер', 'Трансфер', 'Подарунок', 'Пральня', 'Інше'] },
			{ key: 'amount', label: 'Сума, ₴', kind: 'money', initial: '0' },
			{ key: 'who', label: 'Відповідальний', kind: 'select', options: STAFF },
			{ key: 'note', label: 'Примітка', kind: 'text', wide: true },
		],
		seed: [
			{ date: '2026-09-16', item: 'Квіти в номер', amount: '450', who: 'Марія Шевчук', note: 'Вітальний букет до заїзду' },
			{ date: '2026-09-17', item: 'Подарунок', amount: '180', who: 'Ірина Лисенко', note: 'Іграшка для дитячого ліжечка' },
		],
	},
	transfer: {
		title: 'Перенесення нарахувань',
		hint: 'Нарахування, перенесені на інший рахунок; історія змін зберігається',
		columns: [
			{ key: 'date', label: 'Дата', kind: 'date', initial: '2026-09-17' },
			{ key: 'charge', label: 'Нарахування', kind: 'text' },
			{ key: 'amount', label: 'Сума, ₴', kind: 'money', initial: '0' },
			{ key: 'from', label: 'З рахунку', kind: 'select', options: ['Гість', 'Компанія', 'Група'] },
			{ key: 'to', label: 'На рахунок', kind: 'select', options: ['Компанія', 'Гість', 'Група'] },
			{ key: 'reason', label: 'Причина', kind: 'text', wide: true },
		],
		seed: [{ date: '2026-09-16', charge: 'Паркінг, доба × 3', amount: '450', from: 'Гість', to: 'Компанія', reason: 'Оплачує партнер за договором' }],
	},
	calls: {
		title: 'Дзвінки',
		hint: 'Розмови з гостем щодо цього бронювання',
		columns: [
			{ key: 'date', label: 'Дата', kind: 'date', initial: '2026-09-17' },
			{ key: 'direction', label: 'Напрям', kind: 'select', options: ['Вхідний', 'Вихідний'] },
			{ key: 'who', label: 'Хто', kind: 'text' },
			{ key: 'length', label: 'Тривалість', kind: 'text', initial: '2 хв' },
			{ key: 'summary', label: 'Підсумок', kind: 'text', wide: true },
		],
		seed: [
			{ date: '2026-09-14', direction: 'Вхідний', who: 'Анна Коваленко', length: '3 хв', summary: 'Уточнила дати, просила тихий номер' },
			{ date: '2026-09-16', direction: 'Вихідний', who: 'Марія Шевчук', length: '1 хв', summary: 'Підтвердила ранній заїзд близько 13:30' },
		],
	},
	vouchers: {
		title: 'Путівки та сертифікати',
		hint: 'Пакети, сертифікати й абонементи, які гість використовує під час проживання',
		columns: [
			{ key: 'number', label: 'Номер', kind: 'text' },
			{ key: 'type', label: 'Тип', kind: 'select', options: ['Пакет «Вихідні»', 'Подарунковий сертифікат', 'СПА-абонемент'] },
			{ key: 'validTo', label: 'Дійсна до', kind: 'date', initial: '2026-12-31' },
			{ key: 'amount', label: 'Сума, ₴', kind: 'money', initial: '0' },
			{ key: 'status', label: 'Статус', kind: 'select', options: ['Активна', 'Використана', 'Прострочена'] },
		],
		seed: [{ number: 'VCH-0417', type: 'Подарунковий сертифікат', validTo: '2026-12-31', amount: '1500', status: 'Активна' }],
	},
};

const NOW_LABEL = () => `17 вересня 2026 · ${new Date().toTimeString().slice(0, 5)}`;
const uid = () => Math.random().toString(36).slice(2, 9);

function room(id: string, number: string, type: string, floor: number, capacity: number, price: number, extraGuests: number): RoomRecord {
	return {
		id,
		number,
		type,
		floor,
		capacity,
		beds: capacity > 2 ? '1 двоспальне + дивани' : '1 двоспальне',
		area: 18 + capacity * 6,
		price,
		extraGuests,
		extraGuestPrice: 300,
		amenities: [],
		status: 'ready',
		block: null,
		lastCleanedAt: null,
	};
}

const DEMO_ROOMS: RoomRecord[] = [
	room('r201', '201', 'Стандарт', 2, 2, 1000, 0),
	room('r203', '203', 'Стандарт', 2, 2, 1000, 0),
	room('r204', '204', 'Люкс', 2, 2, 1400, 1),
	room('r205', '205', 'Люкс', 2, 2, 1400, 1),
	room('r301', '301', 'Сімейний', 3, 4, 1900, 1),
];

function stay(id: string, roomId: string, roomNumber: string, guestName: string, checkIn: string, checkOut: string, total: number): BookingRecord {
	return {
		id,
		roomId,
		roomNumber,
		guestName,
		phone: '',
		email: '',
		checkIn,
		checkOut,
		guests: 2,
		total,
		paid: 0,
		status: 'confirmed',
		source: 'Телефон',
		notes: '',
		lateCheckoutHour: null,
		createdAt: null,
	};
}

const DEMO_BOOKING: BookingRecord = {
	id: DEMO_BOOKING_ID,
	roomId: 'r204',
	roomNumber: '204',
	guestName: 'Анна Коваленко',
	phone: '+380 67 123 45 67',
	email: 'anna@example.com',
	checkIn: '2026-09-17',
	checkOut: '2026-09-20',
	guests: 2,
	adults: 2,
	children: 0,
	childrenPaid: 0,
	total: 4200,
	paid: 3000,
	status: 'confirmed',
	source: 'Instagram',
	notes: 'Рання реєстрація, якщо номер буде готовий.',
	checkInTime: '14:00',
	checkOutTime: '12:00',
	rate: 'Стандартний',
	extraGuests: 0,
	housekeepingNote: 'Дитяче ліжечко поставити до заїзду.',
	accommodationType: 'Двомісне',
	mealPlan: 'Сніданок (BB)',
	citizenship: 'Україна',
	privilegeCategory: 'Резидент',
	contactPerson: 'Анна Коваленко',
	manager: 'Ірина Лисенко',
	visitPurpose: 'Відпочинок',
	paymentType: 'Безготівковий',
	payMethod: 'Передоплата',
	creditLimit: 0,
	creditRemainder: 0,
	depositBalance: 0,
	lateCheckoutHour: null,
	createdAt: new Date('2026-09-14T12:11:00'),
};

/** Fields that exist only in the demo (`live: false` in the field list), kept next to the booking. */
const DEMO_EXTRAS: Record<string, string> = {
	roomProperties: 'Тихий номер',
	inventory: 'Дитяче ліжечко',
	extraFeatures: 'Ранній заїзд узгоджено',
	guarantee: 'Гарантована',
	transfer: '',
	transferDecision: '',
	documents: '',
	companySegment: '',
	loyaltyCard: 'GH-004217',
	autoCharging: 'true',
	priceFixation: 'При критичних змінах',
};

function person(over: Partial<DemoGuest>): DemoGuest {
	return {
		id: uid(),
		primary: false,
		lastName: '',
		firstName: '',
		middleName: '',
		gender: '',
		ageGroup: 'Дорослий',
		birthDate: '',
		phone: '',
		email: '',
		citizenship: 'Україна',
		city: '',
		address: '',
		documentType: 'Паспорт',
		documentNumber: '',
		vip: false,
		blacklist: false,
		consent: true,
		notes: '',
		stays: 0,
		...over,
	};
}

/**
 * The booking card's data in the demo: one seeded booking and everything around it, in memory only
 * (a reload starts over). It plays the part Firestore plays for a real hotel.
 */
@Injectable()
export class BookingDemoStore {
	readonly rooms = signal<RoomRecord[]>(DEMO_ROOMS);
	readonly bookings = signal<BookingRecord[]>([
		DEMO_BOOKING,
		stay('demo-b1', 'r205', '205', 'Тарас Бондар', '2026-09-16', '2026-09-19', 4200),
		stay('demo-b2', 'r203', '203', 'Ірина Гончар', '2026-09-18', '2026-09-21', 3000),
	]);
	/** Values of demo-only fields, by field key. */
	readonly extras = signal<Record<string, string>>({ ...DEMO_EXTRAS });

	readonly guests = signal<DemoGuest[]>([
		person({
			primary: true,
			lastName: 'Коваленко',
			firstName: 'Анна',
			middleName: 'Сергіївна',
			gender: 'Жіноча',
			birthDate: '1988-04-12',
			phone: '+380 67 123 45 67',
			email: 'anna@example.com',
			city: 'Львів',
			address: 'вул. Вигадана, 10',
			documentNumber: 'АА 000001',
			stays: 2,
			notes: 'Любить тихі номери на високому поверсі.',
		}),
		person({
			lastName: 'Коваленко',
			firstName: 'Олексій',
			middleName: 'Петрович',
			gender: 'Чоловіча',
			birthDate: '1986-09-02',
			city: 'Львів',
			address: 'вул. Вигадана, 10',
			documentNumber: 'АА 000002',
			stays: 2,
		}),
	]);

	readonly services = signal<DemoCharge[]>([
		{ id: 'c1', service: 'Сніданок', date: '2026-09-17', qty: 6, price: 100 },
		{ id: 'c2', service: 'Паркінг, доба', date: '2026-09-17', qty: 3, price: 150 },
		{ id: 'c3', service: 'Пізній виїзд', date: '2026-09-20', qty: 1, price: 500 },
	]);

	readonly payments = signal<DemoPayment[]>([
		{ id: 'p1', date: '2026-09-14', amount: 2000, method: 'Онлайн', note: 'Передоплата' },
		{ id: 'p2', date: '2026-09-16', amount: 1000, method: 'Банківський переказ', note: 'Додано вручну' },
	]);

	readonly tasks = signal<DemoTask[]>([
		{ id: 't1', title: 'Поставити дитяче ліжечко в номер до заїзду', assignee: 'Марія Шевчук', due: '2026-09-17 12:00', done: false },
		{ id: 't2', title: 'Підготувати паркомісце', assignee: 'Олег Дорошенко', due: '2026-09-17 13:00', done: false },
		{ id: 't3', title: 'Підтвердити ранній заїзд з гостею', assignee: 'Ірина Лисенко', due: '2026-09-16 18:00', done: true },
	]);

	readonly notes = signal<DemoNote[]>([
		{ id: 'n1', author: 'Ірина Лисенко', at: '14 вересня 2026 · 12:20', text: 'Просять тихий номер, без сусідів зі сторони ліфта.' },
		{ id: 'n2', author: 'Марія Шевчук', at: '16 вересня 2026 · 17:40', text: 'Гості приїдуть близько 13:30, потрібне дитяче ліжечко.' },
	]);

	readonly history = signal<DemoHistory[]>([
		{ at: '14 вересня 2026 · 12:11', actor: 'Ірина Лисенко', text: 'Бронювання створено (джерело: Instagram)' },
		{ at: '14 вересня 2026 · 12:20', actor: 'Система', text: 'Отримано оплату 2 000 ₴ (онлайн)' },
		{ at: '16 вересня 2026 · 17:42', actor: 'Марія Шевчук', text: 'Додано оплату 1 000 ₴ (банківський переказ)' },
		{ at: '16 вересня 2026 · 17:45', actor: 'Марія Шевчук', text: 'Додано примітку' },
	]);

	/** Rows of the list tabs (`RECORD_TABS`), by tab. */
	readonly records = signal<Partial<Record<TabId, RecordRow[]>>>(
		Object.fromEntries(Object.entries(RECORD_TABS).map(([tab, def]) => [tab, def!.seed.map((row) => ({ ...row, id: uid() }))])),
	);

	addRecord(tab: TabId, row: Record<string, string>): void {
		this.records.update((all) => ({ ...all, [tab]: [...(all[tab] ?? []), { ...row, id: uid() }] }));
		this.log(`Додано запис: ${RECORD_TABS[tab]?.title ?? tab}`);
	}

	removeRecord(tab: TabId, id: string): void {
		this.records.update((all) => ({ ...all, [tab]: (all[tab] ?? []).filter((r) => r.id !== id) }));
		this.log(`Видалено запис: ${RECORD_TABS[tab]?.title ?? tab}`);
	}

	readonly bookedBy ='Ірина Лисенко';

	/** Last change, as the card's footer shows it. */
	readonly lastChange = signal({ actor: 'Марія Шевчук', at: '16 вересня 2026 · 17:45' });

	readonly booking = computed(() => this.bookings().find((b) => b.id === DEMO_BOOKING_ID)!);
	readonly servicesTotal = computed(() => this.services().reduce((sum, c) => sum + c.qty * c.price, 0));

	update(patch: BookingPatch, label = 'Дані бронювання'): void {
		this.bookings.update((list) => list.map((b) => (b.id === DEMO_BOOKING_ID ? { ...b, ...patch } : b)));
		this.log(`Змінено: ${label}`);
	}

	setExtra(key: string, value: string): void {
		this.extras.update((e) => ({ ...e, [key]: value }));
	}

	log(text: string): void {
		const at = NOW_LABEL();
		const actor = 'Ви (демо)';
		this.history.update((h) => [...h, { at, actor, text }]);
		this.lastChange.set({ actor, at });
	}

	addNote(text: string): void {
		const value = text.trim();
		if (!value) return;
		this.notes.update((n) => [...n, { id: uid(), author: 'Ви (демо)', at: NOW_LABEL(), text: value }]);
		this.log('Додано примітку');
	}

	addCharge(service: string, qty: number, price: number, date: string): void {
		this.services.update((s) => [...s, { id: uid(), service, qty, price, date }]);
		this.log(`Додано нарахування «${service}»`);
	}

	removeCharge(id: string): void {
		const gone = this.services().find((c) => c.id === id);
		this.services.update((s) => s.filter((c) => c.id !== id));
		if (gone) this.log(`Видалено нарахування «${gone.service}»`);
	}

	addPayment(amount: number, method: string, date: string, note: string): void {
		this.payments.update((p) => [...p, { id: uid(), amount, method, date, note: note.trim() || 'Додано вручну' }]);
		this.bookings.update((list) => list.map((b) => (b.id === DEMO_BOOKING_ID ? { ...b, paid: b.paid + amount } : b)));
		this.log(`Додано оплату ${amount} ₴ (${method.toLowerCase()})`);
	}

	addGuest(): void {
		this.guests.update((g) => [...g, person({ lastName: this.booking().guestName.split(' ').pop() ?? '' })]);
		this.log('Додано анкету гостя');
	}

	updateGuest(id: string, patch: Partial<DemoGuest>): void {
		this.guests.update((g) => g.map((p) => (p.id === id ? { ...p, ...patch } : p)));
	}

	removeGuest(id: string): void {
		this.guests.update((g) => g.filter((p) => p.id !== id || p.primary));
		this.log('Видалено анкету гостя');
	}

	addTask(title: string, assignee: string, due: string): void {
		const value = title.trim();
		if (!value) return;
		this.tasks.update((t) => [...t, { id: uid(), title: value, assignee, due, done: false }]);
		this.log(`Додано завдання «${value}»`);
	}

	toggleTask(id: string): void {
		this.tasks.update((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
	}

	removeTask(id: string): void {
		this.tasks.update((t) => t.filter((x) => x.id !== id));
	}
}
