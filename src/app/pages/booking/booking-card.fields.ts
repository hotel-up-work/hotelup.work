export type FieldKind = 'text' | 'tel' | 'email' | 'date' | 'time' | 'number' | 'money' | 'select' | 'textarea' | 'check' | 'readonly';

export interface FieldDef {
	/** A `BookingRecord` field, or a derived one (`nights`, `price`, `total`, `balance`). */
	key: string;
	label: string;
	kind: FieldKind;
	options?: string[];
	hint?: string;
	/** Not backed by data yet: shown disabled, so the layout matches the desk card and nothing is lost later. */
	soon?: boolean;
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

/** Tabs of the desk card. Only the first one exists; the rest keep their place until they are built. */
export const CARD_TABS = [
	'Картка',
	'Анкети',
	'Нарахування',
	'Реєстр. картка',
	'Підтвердження',
	'Анулація',
	'Прокат',
	'Завдання',
	'Розходи',
	'Перенесення нарахувань',
	'Балансовий рахунок',
	'Дзвінки',
	'Робота з ключами',
	'Путівки',
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
				{ key: 'extraGuests', label: 'Дод. місця', kind: 'number', hint: 'Люди понад місткість номера' },
				{ key: 'byBed', label: 'По місцях', kind: 'check' },
				{ key: 'bedNumber', label: 'Місце', kind: 'number' },
				{ key: 'roomProperties', label: 'Властивості кімнат', kind: 'select', soon: true },
			],
		},
		{
			id: 'notes',
			title: 'Нотатки',
			fields: [
				{ key: 'notes', label: 'Примітки', kind: 'textarea', wide: true },
				{ key: 'housekeepingNote', label: 'Для прибирання', kind: 'textarea', wide: true },
				{ key: 'guestTasks', label: 'Завдання гостя', kind: 'text', soon: true, wide: true },
				{ key: 'inventory', label: 'Готельний інвентар', kind: 'text', soon: true, wide: true },
				{ key: 'extraFeatures', label: 'Додаткові характеристики', kind: 'text', soon: true, wide: true },
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
				{ key: 'guarantee', label: 'Бронь', kind: 'select', soon: true },
				{ key: 'transfer', label: 'Замовлений трансфер', kind: 'check', soon: true },
				{ key: 'transferDecision', label: 'Дата рішення', kind: 'date', soon: true },
				{ key: 'documents', label: 'Відрядні посвідчення', kind: 'text', soon: true, wide: true },
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
				{ key: 'companySegment', label: 'Сегмент компанії', kind: 'select', soon: true },
				{ key: 'loyaltyCard', label: 'Карта лояльності', kind: 'text', soon: true },
				{ key: 'autoCharging', label: 'Автонарахування', kind: 'check', soon: true },
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
				{ key: 'paid', label: 'Оплачено', kind: 'readonly', hint: 'Оплати додаються на сторінці «Оплати»' },
				{ key: 'balance', label: 'Баланс', kind: 'readonly' },
				{ key: 'depositBalance', label: 'Баланс по депозиту, ₴', kind: 'money' },
				{ key: 'creditLimit', label: 'Кредитний ліміт, ₴', kind: 'money' },
				{ key: 'creditRemainder', label: 'Залишок ліміту, ₴', kind: 'money' },
				{ key: 'priceFixation', label: 'Фіксація ціни', kind: 'select', soon: true },
			],
		},
	],
];
