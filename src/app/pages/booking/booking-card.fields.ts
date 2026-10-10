export type FieldKind = 'text' | 'tel' | 'email' | 'date' | 'time' | 'number' | 'money' | 'select' | 'textarea' | 'check' | 'readonly';

export interface FieldDef {
	/** A `BookingRecord` field, or a derived one (`nights`, `price`, `total`, `balance`). */
	key: string;
	label: string;
	kind: FieldKind;
	options?: string[];
	/** False: not saved to a real booking yet. A real account does not see it; the demo keeps it in memory. */
	live?: boolean;
	/** Spans the whole section width. */
	wide?: boolean;
	autocomplete?: string;
}

export interface SectionDef {
	id: string;
	title: string;
	/** Money sections are hidden from roles without the guest-bill capability. */
	finance?: boolean;
	fields: FieldDef[];
}

export type TabId =
	| 'card'
	| 'guests'
	| 'charges'
	| 'registration'
	| 'confirmation'
	| 'cancellation'
	| 'rental'
	| 'tasks'
	| 'expenses'
	| 'transfer'
	| 'balance'
	| 'calls'
	| 'keys'
	| 'vouchers';

export interface TabDef {
	id: TabId;
	label: string;
	/** Built on real data; a real account sees only these tabs. */
	live: boolean;
	/** Money tab: hidden from roles without the guest-bill capability. */
	finance?: boolean;
	/** Built in the demo with seeded data; the other tabs are listed there as disabled "Скоро". */
	demo: boolean;
}

/** Tabs of the desk card. The first is built on real data; the rest are demo-only or still to come. */
export const CARD_TABS: TabDef[] = [
	{ id: 'card', label: 'Картка', live: true, demo: true },
	{ id: 'guests', label: 'Анкети', live: false, demo: true },
	{ id: 'charges', label: 'Нарахування', live: false, demo: true, finance: true },
	{ id: 'registration', label: 'Реєстр. картка', live: false, demo: true },
	{ id: 'confirmation', label: 'Підтвердження', live: false, demo: true },
	{ id: 'cancellation', label: 'Анулація', live: false, demo: true },
	{ id: 'rental', label: 'Прокат', live: false, demo: true },
	{ id: 'tasks', label: 'Завдання', live: false, demo: true },
	{ id: 'expenses', label: 'Розходи', live: false, demo: true },
	{ id: 'transfer', label: 'Перенесення нарахувань', live: false, demo: true },
	{ id: 'balance', label: 'Балансовий рахунок', live: false, demo: true, finance: true },
	{ id: 'calls', label: 'Дзвінки', live: false, demo: true },
	{ id: 'keys', label: 'Робота з ключами', live: false, demo: true },
	{ id: 'vouchers', label: 'Путівки', live: false, demo: true },
];

const NONE = '';

export const RATES = ['Стандартний', 'Rack rate', 'Корпоративний', 'Акційний', 'Для сайту'];
export const SOURCES = ['Телефон', 'Walk-in', 'Пряме бронювання', 'Сайт', 'Instagram', 'Google', 'Booking.com', 'Інше'];
const ACCOMMODATION = ['Одномісне', 'Двомісне', 'Тримісне', 'Сімейне', 'Група'];
const MEALS = ['Без харчування (RO)', 'Сніданок (BB)', 'Напівпансіон (HB)', 'Повний пансіон (FB)', 'Все включено (AI)'];
const CITIZENSHIP = ['Україна', 'Польща', 'Німеччина', 'Ізраїль', 'США', 'Інше'];
const SURCHARGE = ['Резидент', 'Нерезидент'];
const PURPOSES = ['Відпочинок', 'Бізнес', 'Лікування', 'Конференція', 'Транзит', 'Родина або друзі'];
const PAYMENT_TYPES = ['Готівковий', 'Безготівковий', 'Змішаний'];
const PAY_METHODS = ['Оплата на місці', 'Передоплата', 'Оплата при бронюванні', 'Рахунок для компанії'];
const GUARANTEE = ['Гарантована', 'Не гарантована'];
const ROOM_PROPERTIES = ['Тихий номер', 'Високий поверх', 'Вид на місто', 'Балкон', 'Поруч із ліфтом'];
const COMPANY_SEGMENTS = ['Корпоративні клієнти', 'Туроператори', 'Агенції', 'Приватні особи'];
const PRICE_FIXATION = ['При критичних змінах', 'Завжди', 'Ніколи'];

/** Select options always start with an empty "not set" choice. */
export const NOT_SET = NONE;

/** Three columns, as on the desk card: stay, guest, then terms and money. */
export const COLUMNS: SectionDef[][] = [
	[
		{
			id: 'stay',
			title: 'Проживання',
			fields: [
				{ key: 'checkIn', label: 'Заїзд', kind: 'date' },
				{ key: 'checkInTime', label: 'Час заїзду', kind: 'time' },
				{ key: 'checkOut', label: 'Виїзд', kind: 'date' },
				{ key: 'checkOutTime', label: 'Час виїзду', kind: 'time' },
				{ key: 'nights', label: 'Ночей', kind: 'number' },
				{ key: 'roomId', label: 'Кімната', kind: 'select' },
				{ key: 'accommodationType', label: 'Тип розміщення', kind: 'select', options: ACCOMMODATION },
				{ key: 'adults', label: 'Дорослих', kind: 'number' },
				{ key: 'children', label: 'Дітей', kind: 'number' },
				{ key: 'childrenPaid', label: 'Дітей з оплатою', kind: 'number' },
				{ key: 'extraGuests', label: 'Дод. місця', kind: 'number' },
				{ key: 'byBed', label: 'По місцях', kind: 'check' },
				{ key: 'bedNumber', label: 'Місце', kind: 'number' },
				{ key: 'roomProperties', label: 'Властивості кімнат', kind: 'select', options: ROOM_PROPERTIES, live: false },
			],
		},
		{
			id: 'notes',
			title: 'Нотатки',
			fields: [
				{ key: 'notes', label: 'Примітки', kind: 'textarea', wide: true },
				{ key: 'housekeepingNote', label: 'Для прибирання', kind: 'textarea', wide: true },
				{ key: 'inventory', label: 'Готельний інвентар', kind: 'text', live: false, wide: true },
				{ key: 'extraFeatures', label: 'Додаткові характеристики', kind: 'text', live: false, wide: true },
			],
		},
	],
	[
		{
			id: 'guest',
			title: 'Гість',
			fields: [
				{ key: 'guestName', label: 'ПІБ', kind: 'text', wide: true, autocomplete: 'name' },
				{ key: 'phone', label: 'Телефон', kind: 'tel', autocomplete: 'tel' },
				{ key: 'email', label: 'Електронна пошта', kind: 'email', autocomplete: 'email' },
				{ key: 'citizenship', label: 'Громадянство', kind: 'select', options: CITIZENSHIP },
				{ key: 'privilegeCategory', label: 'Категорія надбавки', kind: 'select', options: SURCHARGE },
				{ key: 'contactPerson', label: 'Контактна особа', kind: 'text' },
				{ key: 'manager', label: 'Менеджер', kind: 'text' },
				{ key: 'guarantee', label: 'Бронь', kind: 'select', options: GUARANTEE, live: false },
				{ key: 'transfer', label: 'Замовлений трансфер', kind: 'check', live: false },
				{ key: 'transferDecision', label: 'Дата рішення', kind: 'date', live: false },
				{ key: 'documents', label: 'Відрядні посвідчення', kind: 'text', live: false, wide: true },
			],
		},
		{
			id: 'terms',
			title: 'Умови та джерело',
			fields: [
				{ key: 'rate', label: 'Прейскурант', kind: 'select', options: RATES },
				{ key: 'mealPlan', label: 'Тип харчування', kind: 'select', options: MEALS },
				{ key: 'paymentType', label: 'Тип оплати', kind: 'select', options: PAYMENT_TYPES },
				{ key: 'payMethod', label: 'Спосіб оплати', kind: 'select', options: PAY_METHODS },
				{ key: 'source', label: 'Джерело', kind: 'select', options: SOURCES },
				{ key: 'visitPurpose', label: 'Мета візиту', kind: 'select', options: PURPOSES },
				{ key: 'companyOperator', label: 'Компанія-оператор', kind: 'text' },
				{ key: 'companySource', label: 'Компанія-джерело', kind: 'text' },
				{ key: 'contractTerms', label: 'Умова договору', kind: 'text' },
				{ key: 'externalNumber', label: 'Номер бронювання зовнішньої системи', kind: 'text', wide: true },
				{ key: 'companySegment', label: 'Сегмент компанії', kind: 'select', options: COMPANY_SEGMENTS, live: false },
				{ key: 'loyaltyCard', label: 'Карта лояльності', kind: 'text', live: false },
				{ key: 'autoCharging', label: 'Автонарахування', kind: 'check', live: false },
			],
		},
	],
	[
		{
			id: 'money',
			title: 'Вартість і баланс',
			finance: true,
			fields: [
				{ key: 'price', label: 'Ціна за ніч, ₴', kind: 'money' },
				{ key: 'total', label: 'Разом за проживання', kind: 'readonly' },
				{ key: 'services', label: 'Додаткові послуги', kind: 'readonly', live: false },
				{ key: 'paid', label: 'Оплачено', kind: 'readonly' },
				{ key: 'balance', label: 'Баланс', kind: 'readonly' },
				{ key: 'depositBalance', label: 'Баланс по депозиту, ₴', kind: 'money' },
				{ key: 'creditLimit', label: 'Кредитний ліміт, ₴', kind: 'money' },
				{ key: 'creditRemainder', label: 'Залишок ліміту, ₴', kind: 'money' },
				{ key: 'priceFixation', label: 'Фіксація ціни', kind: 'select', options: PRICE_FIXATION, live: false },
			],
		},
	],
];

/** The sections a mode shows: a real account gets only fields that are saved; the demo gets everything. */
export function columnsFor(demo: boolean, showFinance: boolean): SectionDef[][] {
	return COLUMNS.map((column) =>
		column
			.filter((section) => !section.finance || showFinance)
			.map((section) => ({ ...section, fields: demo ? section.fields : section.fields.filter((f) => f.live !== false) }))
			.filter((section) => section.fields.length),
	).filter((column) => column.length);
}

export function tabsFor(demo: boolean, showFinance: boolean): TabDef[] {
	return (demo ? CARD_TABS : CARD_TABS.filter((t) => t.live)).filter((t) => !t.finance || showFinance);
}
