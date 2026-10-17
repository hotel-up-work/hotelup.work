import { Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppShellComponent } from '../../../layouts/app-shell/app-shell.component';
import {
	BookingInput,
	BookingPatch,
	BookingRecord,
	BookingsService,
	BookingStatus,
	checkOutPatch,
	holdsRoom,
	STAY_ACTION_LABEL,
	stayActions,
	type StayAction,
} from '../../../feature/firebase/bookings.service';
import { GuestsService } from '../../../feature/firebase/guests.service';
import { HotelService } from '../../../feature/firebase/hotel.service';
import { HotelSettingsService } from '../../../feature/firebase/hotel-settings.service';
import { localDay, PaymentMethod, PaymentsService } from '../../../feature/firebase/payments.service';
import { RoomRecord, RoomsService, RoomStatus } from '../../../feature/firebase/rooms.service';
import { SubmissionRecord, SubmissionsService } from '../../../feature/firebase/submissions.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { FitNameDirective } from './fit-name.directive';
import { limitRoomsToPlan } from '../../../shared/plan';
import { canCurrent, isLiveSession } from '../../../shared/role';

interface Room {
	/** Firestore document id (the room number in the demo). */
	id: string;
	number: string;
	type: string;
	cap: string;
	capacity: number;
	price: number;
	/** Stored status; `unavailable` is a technical block. */
	status: RoomStatus;
	floor: number;
	beds: string;
	area: number | null;
	/** Places beyond `capacity`, and what each costs per night. */
	extraGuests: number;
	extraGuestPrice: number;
	amenities: string[];
	/** Building or wing, bathroom, balcony and view ('' = not set). */
	building: string;
	bathroom: string;
	balcony: string;
	view: string;
}

/** Room details shown when the pointer is on a room's cell (like the legacy chessboard's room tooltip). */
interface RoomHover {
	room: Room;
	x: number;
	y: number;
}

type Status = BookingStatus;

interface Booking {
	id: string;
	/** Room number shown in the grid; follows the room when it is renumbered. */
	room: string;
	roomId: string;
	name: string;
	phone: string;
	email: string;
	start: string;
	end: string;
	guests: number;
	total: number;
	paid: number;
	status: Status;
	source: string;
	notes: string;
	lateCheckoutHour?: number;
	submissionId?: string;
	/** Check-out as booked, when an early check-out shortened the stay. */
	plannedCheckOut?: string;
	guestId?: string;
	guarantee?: string;
	mealPlan?: string;
	companyOperator?: string;
	/** Room type the guest pays for; differs from the room's type when they were moved up or down. */
	rateCategory?: string;
	roomLocked?: boolean;
	/** Number in the channel the booking came from (Booking.com etc.); shown instead of the internal id. */
	externalNumber?: string;
	adults?: number;
	children?: number;
	/** Planned arrival / departure time, `HH:MM`; the hotel's 14:00 / 11:00 when not set. */
	checkInTime?: string;
	checkOutTime?: string;
	rate?: string;
	manager?: string;
	depositBalance?: number;
	/** From the guest's tags (`VIP`, `Чорний список`); the demo seeds them on the booking. */
	vip?: boolean;
	blacklisted?: boolean;
}

/**
 * Where the stay is today, which sets the block's colour (like the legacy chessboard): a plain booking,
 * one with money taken, arriving today, in the house, leaving today, gone, on the waitlist, cancelled,
 * or in conflict with another stay or a room block in the same room.
 */
type Stage = 'booking' | 'prepaid' | 'arriving' | 'staying' | 'departing' | 'checkedout' | 'waitlist' | 'cancelled' | 'conflict';

/** Kinds of room block, picked from the block reason the Rooms page saves. */
type BlockKind = 'repair' | 'service' | 'out' | 'other';

interface Badge {
	icon: string;
	title: string;
}

interface Blocked {
	room: string;
	/** Exclusive end, like a booking's check-out. */
	start: string;
	end: string;
	reason: string;
	note?: string;
}

type DialogView =
	| { kind: 'quick-booking' }
	| { kind: 'conflict'; room: string; start: string; end: string; type: string; moveId?: string }
	| { kind: 'confirm-move' }
	| { kind: 'message'; bookingId: string }
	| { kind: 'payment'; bookingId: string }
	| { kind: 'extend-stay'; bookingId: string }
	| { kind: 'extend-nights'; bookingId: string }
	| { kind: 'cancel'; bookingId: string }
	| null;

/** Night-audit item: something the desk should have marked but hasn't. */
interface AuditItem {
	booking: Booking;
	kind: 'overstay' | 'no-show';
}

interface BookingForm {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	/** Room number. */
	room: string;
	guests: number;
	start: string;
	end: string;
	/** null = nights × room price. */
	total: number | null;
	source: string;
	payment: 'none' | 'half' | 'full';
	/** How the money taken at booking time is received. */
	method: PaymentMethod;
	status: 'confirmed' | 'pending' | 'waitlist';
	notes: string;
	/** Website request this booking is created from. */
	submission: { id: string; label: string; message: string; roomType: string } | null;
}

const CHECKIN_HOUR = 14;
const CHECKOUT_HOUR = 11;
const ALL_STATUSES: Status[] = ['confirmed', 'pending', 'checkedin', 'checkedout', 'cancelled', 'waitlist'];
const COMPACT_KEY = 'calendar.compact';
const LEGEND_KEY = 'calendar.legend';
const VIP_TAG = 'VIP';
const BLACKLIST_TAG = 'Чорний список';
const LATE_CHECKOUT_OPTIONS = [12, 14, 16, 18];
const MS = 86400000;

const DEMO_ROOMS: { number: string; type: string; cap: string }[] = [
	{ number: '101', type: 'Стандарт', cap: '2 гості' },
	{ number: '102', type: 'Стандарт', cap: '2 гості' },
	{ number: '103', type: 'Стандарт', cap: '2 гості' },
	{ number: '104', type: 'Стандарт', cap: '2 гості' },
	{ number: '105', type: 'Стандарт', cap: '2 гості' },
	{ number: '106', type: 'Покращений', cap: '2–3 гості' },
	{ number: '107', type: 'Покращений', cap: '2–3 гості' },
	{ number: '108', type: 'Покращений', cap: '2–3 гості' },
	{ number: '201', type: 'Люкс', cap: '2–3 гості' },
	{ number: '202', type: 'Люкс', cap: '2–3 гості' },
	{ number: '203', type: 'Люкс', cap: '2–3 гості' },
	{ number: '204', type: 'Люкс', cap: '2–3 гості' },
	{ number: '205', type: 'Люкс', cap: '2–3 гості' },
	{ number: '301', type: 'Апартаменти', cap: '4 гості' },
	{ number: '302', type: 'Апартаменти', cap: '4 гості' },
];
const BASE_PRICE: Record<string, number> = { Стандарт: 1600, Покращений: 2000, Люкс: 2400, Апартаменти: 3200 };
const SOURCES = ['Пряме бронювання', 'Сайт', 'Instagram', 'Google', 'Телефон', 'Booking.com', 'Walk-in', 'Інше'];

/**
 * Demo stays, dated from today so the grid always has people around the current day: offsets are days
 * from today (0 = today). Built when the page opens, not at build time.
 */
function seedBookings(): Omit<Booking, 'roomId'>[] {
	const day = (n: number) => addDays(DEMO_TODAY(), n);
	const stays: Omit<Booking, 'roomId'>[] = [
		{ id: '2001', room: '204', name: 'Злата Вербицька', phone: '+380 00 000 00 01', email: 'guest-2001@example.com', start: day(0), end: day(3), guests: 2, total: 4800, paid: 4800, status: 'confirmed', source: 'Instagram', notes: 'Потрібен тихий номер. Очікуваний час прибуття: 13:30.', vip: true, guarantee: 'Гарантована', mealPlan: 'Сніданок (BB)', roomLocked: true },
		{ id: '2002', room: '103', name: 'Арсен Кушнір', phone: '+380 00 000 00 02', email: '', start: day(0), end: day(1), guests: 1, total: 2400, paid: 1200, status: 'checkedin', source: 'Телефон', notes: '' },
		{ id: '2003', room: '202', name: 'Мілана Остапенко', phone: '+380 00 000 00 03', email: '', start: day(-3), end: day(4), guests: 2, total: 16800, paid: 9600, status: 'checkedin', source: 'Booking.com', notes: '', vip: true, externalNumber: '4471203', mealPlan: 'Напівпансіон (HB)' },
		{ id: '2004', room: '205', name: 'Ярина Довгань', phone: '+380 00 000 00 04', email: '', start: day(1), end: day(3), guests: 2, total: 4800, paid: 0, status: 'pending', source: 'Пряме бронювання', notes: 'Заїзд орієнтовно ввечері.' },
		{ id: '2005', room: '106', name: 'Всеволод Гаврилюк', phone: '+380 00 000 00 05', email: '', start: day(2), end: day(6), guests: 2, total: 8000, paid: 4000, status: 'confirmed', source: 'Google', notes: '', companyOperator: 'ТОВ «Приклад-Агро» (демо)', rateCategory: 'Стандарт' },
		{ id: '2006', room: '101', name: 'Есмеральда Чорновол', phone: '+380 00 000 00 06', email: '', start: day(3), end: day(5), guests: 1, total: 3200, paid: 3200, status: 'confirmed', source: 'Сайт', notes: '' },
		{ id: '2007', room: '302', name: 'Святогор Мазур', phone: '+380 00 000 00 07', email: '', start: day(4), end: day(7), guests: 4, total: 9600, paid: 4800, status: 'pending', source: 'Booking.com', notes: '' },
		{ id: '2008', room: '107', name: 'Любомир Ничипорук', phone: '+380 00 000 00 08', email: '', start: day(5), end: day(7), guests: 2, total: 4000, paid: 4000, status: 'confirmed', source: 'Пряме бронювання', notes: '', guarantee: 'Гарантована' },
		{ id: '2013', room: '105', name: 'Радомир Савула', phone: '+380 00 000 01 13', email: '', start: day(-5), end: day(0), guests: 1, total: 8000, paid: 8000, status: 'checkedin', source: 'Телефон', notes: 'Виїзд сьогодні.', mealPlan: 'Повний пансіон (FB)' },
		{ id: '2014', room: '108', name: 'Северина Ткачук', phone: '+380 00 000 01 14', email: '', start: day(-2), end: day(-1), guests: 2, total: 2000, paid: 0, status: 'checkedin', source: 'Walk-in', notes: 'Не відмічено виїзд.' },
		{ id: '2015', room: '205', name: 'Боримир Лозинський', phone: '+380 00 000 01 15', email: '', start: day(-1), end: day(1), guests: 1, total: 4800, paid: 2400, status: 'confirmed', source: 'Booking.com', notes: 'Не прибув у день заїзду.', blacklisted: true },
		{ id: '2016', room: '201', name: 'Ладислав Гнатів', phone: '+380 00 000 01 16', email: '', start: day(4), end: day(8), guests: 2, total: 9600, paid: 0, status: 'waitlist', source: 'Сайт', notes: 'Чекає на звільнення люксу.' },
		{ id: '2017', room: '203', name: 'Аделіна Стефурак', phone: '+380 00 000 01 17', email: '', start: day(8), end: day(11), guests: 2, total: 7200, paid: 3600, status: 'confirmed', source: 'Booking.com', notes: 'Прийшло з каналу поверх наявного бронювання.', externalNumber: '4471877' },
		{ id: '2018', room: '101', name: 'Зореслава Білик', phone: '+380 00 000 01 18', email: '', start: day(-2), end: day(2), guests: 2, total: 6400, paid: 6400, status: 'checkedin', source: 'Сайт', notes: '', mealPlan: 'Сніданок (BB)' },
		{ id: '2019', room: '102', name: 'Ассоль Кучерява', phone: '+380 00 000 01 19', email: '', start: day(-1), end: day(3), guests: 2, total: 6400, paid: 3200, status: 'checkedin', source: 'Google', notes: '', vip: true },
		{ id: '2020', room: '104', name: 'Остромир Возняк', phone: '+380 00 000 02 20', email: '', start: day(-4), end: day(1), guests: 1, total: 8000, paid: 8000, status: 'checkedin', source: 'Телефон', notes: '', companyOperator: 'ТОВ «Приклад-Тур» (демо)' },
		{ id: '2021', room: '106', name: 'Мирослава Дейнека', phone: '+380 00 000 02 21', email: '', start: day(-1), end: day(2), guests: 2, total: 6000, paid: 6000, status: 'checkedin', source: 'Instagram', notes: '', guarantee: 'Гарантована' },
		{ id: '2022', room: '107', name: 'Звенислав Лисюк', phone: '+380 00 000 02 22', email: '', start: day(0), end: day(4), guests: 2, total: 8000, paid: 2000, status: 'confirmed', source: 'Booking.com', notes: 'Прибуття після 18:00.', externalNumber: '4472915' },
		{ id: '2023', room: '203', name: 'Вероніка Остапчук', phone: '+380 00 000 02 23', email: '', start: day(-2), end: day(3), guests: 2, total: 12000, paid: 12000, status: 'checkedin', source: 'Пряме бронювання', notes: '', mealPlan: 'Все включено (AI)' },
		{ id: '2024', room: '201', name: 'Ростислав Дячун', phone: '+380 00 000 02 24', email: '', start: day(-3), end: day(2), guests: 2, total: 12000, paid: 6000, status: 'checkedin', source: 'Сайт', notes: '', rateCategory: 'Покращений' },
		{ id: '2025', room: '301', name: 'Уляна Федорів', phone: '+380 00 000 02 25', email: '', start: day(-1), end: day(5), guests: 4, total: 19200, paid: 9600, status: 'checkedin', source: 'Google', notes: 'Сімʼя з дітьми.', lateCheckoutHour: 14 },
		{ id: '2009', room: '203', name: 'Віолета Яцків', phone: '+380 00 000 00 09', email: '', start: day(6), end: day(10), guests: 3, total: 9600, paid: 9600, status: 'confirmed', source: 'Google', notes: '' },
		{ id: '2010', room: '104', name: 'Орест Пилипчук', phone: '+380 00 000 01 10', email: '', start: day(1), end: day(2), guests: 2, total: 1600, paid: 0, status: 'cancelled', source: 'Instagram', notes: 'Скасовано гостем.' },
		{ id: '2011', room: '201', name: 'Ульяна Семенко', phone: '+380 00 000 01 11', email: '', start: day(7), end: day(10), guests: 2, total: 7200, paid: 7200, status: 'confirmed', source: 'Walk-in', notes: '' },
		{ id: '2012', room: '102', name: 'Емануїл Грицай', phone: '+380 00 000 01 12', email: '', start: day(8), end: day(11), guests: 2, total: 4800, paid: 2400, status: 'pending', source: 'Телефон', notes: '' },
	];
	// Terms the desk fills on the booking card: rate, manager, the adults/children split and planned times.
	const times: Record<string, { checkInTime?: string; checkOutTime?: string; adults?: number; children?: number }> = {
		'2001': { checkInTime: '13:30' },
		'2022': { checkInTime: '18:30' },
		'2004': { checkInTime: '21:00' },
		'2013': { checkOutTime: '10:00' },
		'2025': { adults: 2, children: 2, checkOutTime: '12:00' },
		'2003': { checkOutTime: '09:30' },
	};
	return stays.map((b, i) => ({
		rate: ['Стандартний', 'Rack rate', 'Для сайту', 'Корпоративний'][i % 4],
		manager: ['Менеджер Демо 1', 'Менеджер Демо 2', 'Менеджер Демо 3'][i % 3],
		adults: b.guests,
		children: 0,
		...times[b.id],
		...b,
	}));
}

function demoBlocks(): Blocked[] {
	const day = (n: number) => addDays(DEMO_TODAY(), n);
	return [
		{ room: '301', start: day(8), end: day(11), reason: 'Ремонт' },
		{ room: '302', start: day(10), end: day(13), reason: 'Службове використання' },
	];
}

const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const addDays = (s: string, n: number) => {
	const d = toDate(s);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
const shortDate = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toDate(s));
const weekdayShort = (s: string) => ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][toDate(s).getUTCDay()];
const monthLabel = (s: string) =>
	new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toDate(s));
const isWeekend = (s: string) => [0, 6].includes(toDate(s).getUTCDay());
const dayNum = (s: string) => Number(s.slice(-2));
const monthShort = (s: string) => new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' }).format(toDate(s));
/** Stay dates for a block: `10–14 жовт.`, or `28 вер. – 3 жовт.` across months (check-in – check-out). */
const stayRange = (start: string, end: string) =>
	start.slice(0, 7) === end.slice(0, 7)
		? `${dayNum(start)}–${dayNum(end)} ${monthShort(end)}`
		: `${dayNum(start)} ${monthShort(start)} – ${dayNum(end)} ${monthShort(end)}`;
/** `Радомир Савула` → `{ firstName: 'Радомир', lastName: 'Савула' }`: stored names are first name first. */
const splitName = (n: string): Pick<BookingForm, 'firstName' | 'lastName'> => {
	const [firstName = '', ...rest] = (n ?? '').trim().split(/\s+/);
	return { firstName, lastName: rest.join(' ') };
};

/** `Радомир Савула` → `Савула Радомир`: in a narrow block the surname is read first and the first name is cut. */
const surnameFirst = (n: string) => {
	const parts = n.trim().split(/\s+/);
	return parts.length > 1 ? [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ') : n;
};
const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const statusLabel = (s: Status) =>
	({ confirmed: 'Підтверджено', pending: 'Очікує підтвердження', checkedin: 'Заїхав', checkedout: 'Виїхав', cancelled: 'Скасовано', waitlist: 'Лист очікування' })[s];
const STAGE_LABEL: Record<Stage, string> = {
	booking: 'Бронювання',
	prepaid: 'Бронювання з передоплатою',
	arriving: 'Очікується заїзд',
	staying: 'Проживає',
	departing: 'Виїзд сьогодні',
	checkedout: 'Виїхав',
	waitlist: 'Лист очікування',
	cancelled: 'Скасовано',
	conflict: 'Конфлікт поселення',
};
/** First day of the month `n` months from the one `s` is in. */
const addMonths = (s: string, n: number) => {
	const d = toDate(s);
	d.setUTCMonth(d.getUTCMonth() + n, 1);
	return d.toISOString().slice(0, 10);
};
const blockKind = (reason: string): BlockKind =>
	reason === 'Ремонт'
		? 'repair'
		: reason === 'Службове використання' || reason === 'Приватне використання'
			? 'service'
			: reason === 'Не експлуатується'
				? 'out'
				: 'other';
const blockLabel = (reason: string) =>
	({ repair: 'Ремонт · не для продажу', service: 'Службове використання', out: 'Не експлуатується', other: reason || 'Недоступно' })[blockKind(reason)];
/** A calendar view switch chosen earlier in this browser; off when storage is unavailable (prerender, private window). */
function readFlag(key: string): boolean {
	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

function writeFlag(key: string, on: boolean): void {
	try {
		localStorage.setItem(key, on ? '1' : '0');
	} catch {
		// Storage blocked (private window): the choice lasts for this visit only.
	}
}
/** Two date ranges (exclusive ends) share a night. */
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && a.end > b.start;
const paymentLabel = (b: Booking) => (b.paid <= 0 ? 'Не оплачено' : b.paid < b.total ? 'Частково оплачено' : 'Оплачено');
/** `YYYY-MM-DD` in the browser's time zone. */
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** The demo runs on the real date, so its stays sit around today. */
const DEMO_TODAY = () => localDate(new Date());

/** Ukrainian plural: 1 ніч, 2 ночі, 5 ночей. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
const nightsLabel = (n: number) => `${n} ${plural(n, 'ніч', 'ночі', 'ночей')}`;
const guestsLabel = (n: number) => `${n} ${plural(n, 'гість', 'гості', 'гостей')}`;

/** Invented room details for the demo, by type. */
const DEMO_TYPE_DETAILS: Record<
	string,
	{ beds: string; area: number; extraGuests: number; amenities: string[]; description: string; bathroom: string; balcony: string; view: string }
> = {
	Стандарт: { beds: 'Двоспальне ліжко', area: 18, extraGuests: 0, amenities: ['Wi-Fi', 'Телевізор'], description: 'Затишний номер для двох.', bathroom: 'Душ', balcony: 'Без балкона', view: 'Двір' },
	Покращений: { beds: 'Двоспальне ліжко + диван', area: 24, extraGuests: 1, amenities: ['Wi-Fi', 'Телевізор', 'Кондиціонер', 'Міні-бар'], description: 'Просторіший номер із зоною відпочинку.', bathroom: 'Душ', balcony: 'Французький балкон', view: 'Місто' },
	Люкс: { beds: 'King size + диван', area: 36, extraGuests: 1, amenities: ['Wi-Fi', 'Телевізор', 'Кондиціонер', 'Міні-бар'], description: 'Дві кімнати з вітальнею.', bathroom: 'Душ і ванна', balcony: 'Балкон', view: 'Фортеця' },
	Апартаменти: { beds: '2 двоспальні ліжка', area: 52, extraGuests: 2, amenities: ['Wi-Fi', 'Кухня', 'Пральна машина', 'Кондиціонер'], description: 'Апартаменти з кухнею для сімʼї або компанії.', bathroom: 'Ванна', balcony: 'Тераса', view: 'Річка' },
};
/** Rooms whose guests stay several days get a stay-over tidy; rooms after a check-out need a full clean. */
const DEMO_ROOM_STATUS: Record<string, RoomStatus> = {
	'101': 'light-cleaning',
	'202': 'light-cleaning',
	'301': 'light-cleaning',
	'103': 'needs-cleaning',
	'105': 'cleaning',
	'108': 'needs-cleaning',
};

function demoRooms(): Room[] {
	return DEMO_ROOMS.map((r) => {
		const details = DEMO_TYPE_DETAILS[r.type];
		return {
			id: r.number,
			number: r.number,
			type: r.type,
			cap: r.cap,
			capacity: Number(r.cap.match(/(\d)(?!.*\d)/)?.[1] ?? 2),
			price: BASE_PRICE[r.type],
			status: DEMO_ROOM_STATUS[r.number] ?? 'ready',
			floor: Number(r.number[0]),
			beds: details.beds,
			area: details.area,
			extraGuests: details.extraGuests,
			extraGuestPrice: details.extraGuests ? 600 : 0,
			amenities: details.amenities,
			// Floors 1–2 in the main building, the rest in the new wing.
			building: Number(r.number[0]) <= 2 ? 'Головний корпус' : 'Корпус 2',
			bathroom: details.bathroom,
			balcony: details.balcony,
			// Odd rooms of the standard type look at the street, even ones at the yard.
			view: r.type === 'Стандарт' && Number(r.number) % 2 ? 'Місто' : details.view,
		};
	});
}

function toRoom(r: RoomRecord): Room {
	return {
		id: r.id,
		number: r.number,
		type: r.type,
		cap: guestsLabel(r.capacity),
		capacity: r.capacity,
		price: r.price,
		status: r.status,
		floor: r.floor,
		beds: r.beds,
		area: r.area,
		extraGuests: r.extraGuests,
		extraGuestPrice: r.extraGuestPrice,
		amenities: r.amenities,
		building: r.building ?? '',
		bathroom: r.bathroom ?? '',
		balcony: r.balcony ?? '',
		view: r.view ?? '',
	};
}

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
	ready: 'Готовий',
	occupied: 'Зайнятий',
	'light-cleaning': 'Легке прибирання',
	'needs-cleaning': 'Потребує прибирання',
	cleaning: 'Прибирається',
	unavailable: 'Недоступний',
};

function toBooking(r: BookingRecord): Booking {
	return {
		id: r.id,
		room: r.roomNumber,
		roomId: r.roomId,
		name: r.guestName,
		phone: r.phone,
		email: r.email,
		start: r.checkIn,
		end: r.checkOut,
		guests: r.guests,
		total: r.total,
		paid: r.paid,
		status: r.status,
		source: r.source,
		notes: r.notes,
		lateCheckoutHour: r.lateCheckoutHour ?? undefined,
		submissionId: r.submissionId,
		plannedCheckOut: r.plannedCheckOut,
		guestId: r.guestId,
		guarantee: r.guarantee,
		mealPlan: r.mealPlan,
		companyOperator: r.companyOperator,
		rateCategory: r.rateCategory,
		roomLocked: r.roomLocked,
		externalNumber: r.externalNumber,
		adults: r.adults,
		children: r.children,
		checkInTime: r.checkInTime,
		checkOutTime: r.checkOutTime,
		rate: r.rate,
		manager: r.manager,
		depositBalance: r.depositBalance,
	};
}

@Component({
	selector: 'app-calendar',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink, FitNameDirective],
	templateUrl: './calendar.component.html',
	styleUrl: './calendar.component.scss',
})
export class CalendarComponent {
	private readonly _roomsService = inject(RoomsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _submissionsService = inject(SubmissionsService);
	private readonly _guestsService = inject(GuestsService);
	private readonly _paymentsService = inject(PaymentsService);
	private readonly _settings = inject(HotelSettingsService);
	/** Only the payment methods the hotel has switched on in Settings. */
	protected readonly paymentMethods = this._settings.methods;
	private readonly _hotel = inject(HotelService);
	private readonly _route = inject(ActivatedRoute);
	private readonly _router = inject(Router);

	/** Real account: rooms and bookings of the active hotel from Firestore. Demo: the seed data below. */
	protected readonly live = isLiveSession();
	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return "Grand Hotel · Кам'янець-Подільський";
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly showFinance = canCurrent('guestBill');
	/** Move, confirm, check in, extend and cancel bookings. Sales only creates holds (CRM.md). */
	protected readonly canChange = canCurrent('changeBooking');
	protected readonly canCollect = canCurrent('collectPayment') && this.showFinance;

	protected readonly TODAY = localDate(new Date());
	protected readonly SOURCES = SOURCES;
	protected readonly LATE_CHECKOUT_OPTIONS = LATE_CHECKOUT_OPTIONS;
	protected readonly money = money;
	protected readonly shortDate = shortDate;
	protected readonly weekdayShort = weekdayShort;
	protected readonly isWeekend = isWeekend;
	protected readonly dayNum = dayNum;
	protected readonly stayRange = stayRange;
	protected readonly dayDiff = dayDiff;
	protected readonly surnameFirst = surnameFirst;
	protected readonly statusLabel = statusLabel;
	protected readonly paymentLabel = paymentLabel;
	protected readonly nightsLabel = nightsLabel;
	protected readonly guestsLabel = guestsLabel;
	protected readonly stageLabel = (stage: Stage) => STAGE_LABEL[stage];
	protected readonly badgeText = (badges: Badge[]) => badges.map((b) => b.title).join(', ');

	protected readonly rooms = signal<Room[]>(this.live ? [] : limitRoomsToPlan(demoRooms()));
	private readonly _bookings = signal<Booking[]>(this.live ? [] : seedBookings().map((b) => ({ ...b, roomId: b.room })));
	private readonly _blocks = signal<Blocked[]>(this.live ? [] : demoBlocks());
	private readonly _roomsLoaded = signal(!this.live);
	private readonly _bookingsLoaded = signal(!this.live);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._roomsLoaded() || !this._bookingsLoaded());
	/** Writes are possible: always in the demo; for a real hotel once rooms and bookings have loaded. */
	protected readonly ready = computed(() => !this.live || (!!this.hotelId() && !this.loading() && !this.loadError()));

	/** Tags of each guest profile (live only), for the VIP and blacklist marks on their bookings. */
	private readonly _guestTags = signal(new Map<string, string[]>());

	/** Bookings with the room number resolved from the room, so a renumbered room stays in sync, and the guest's VIP / blacklist tags. */
	protected readonly bookings = computed(() => {
		const numbers = new Map(this.rooms().map((r) => [r.id, r.number]));
		const tags = this._guestTags();
		return this._bookings().map((b) => {
			const number = numbers.get(b.roomId);
			const guestTags = b.guestId ? tags.get(b.guestId) : undefined;
			if (!(number && number !== b.room) && !guestTags) return b;
			return {
				...b,
				room: number || b.room,
				...(guestTags ? { vip: guestTags.includes(VIP_TAG), blacklisted: guestTags.includes(BLACKLIST_TAG) } : {}),
			};
		});
	});
	protected readonly blocked = this._blocks.asReadonly();

	/** First visible day: yesterday, so this morning's departures and the stays already running show next to today. */
	protected readonly viewStart = signal(addDays(this.TODAY, -1));
	protected readonly viewDays = signal(14);
	protected readonly search = signal('');
	protected readonly statusFilter = signal(new Set<Status>(ALL_STATUSES));
	protected readonly hiddenTypes = signal(new Set<string>());
	/** Room types folded to their header row: their rooms and stays are not drawn. */
	protected readonly collapsedTypes = signal(new Set<string>());
	protected readonly filtersOpen = signal(false);
	/** Legend panel left of the grid, opened from the topbar. Remembered per browser. */
	protected readonly legendOpen = signal(readFlag(LEGEND_KEY));
	protected readonly auditOpen = signal(false);
	/** Dense grid: shorter rows and narrower days, so about three weeks fit on screen. Remembered per browser. */
	protected readonly compact = signal(readFlag(COMPACT_KEY));
	protected readonly mobileDate = signal(this.TODAY);
	protected readonly mobileDays = signal(1);
	protected readonly selectedId = signal<string | null>(null);
	protected readonly pendingMove = signal<{ id: string; room: string; start: string; end: string } | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly bookingForm = signal<BookingForm>(this._emptyForm(this.TODAY));
	protected readonly formError = signal('');
	protected readonly saving = signal(false);
	protected readonly toastMessage = signal('');
	protected readonly hover = signal<{ booking: Booking; x: number; y: number } | null>(null);
	protected readonly roomHover = signal<RoomHover | null>(null);
	/** Room type descriptions by name (live: from Settings → room types; demo: invented). */
	private readonly _typeDescriptions = signal(
		new Map<string, string>(this.live ? [] : Object.entries(DEMO_TYPE_DETAILS).map(([type, d]) => [type, d.description])),
	);
	protected readonly roomStatusLabel = (s: RoomStatus) => ROOM_STATUS_LABEL[s];

	/** Everything the room tooltip shows: the room itself, its type, block, who is in it and who comes next. */
	protected readonly roomDetails = computed(() => {
		const hover = this.roomHover();
		if (!hover) return null;
		const room = hover.room;
		const today = this.TODAY;
		const stays = this.bookings()
			.filter((b) => b.room === room.number && holdsRoom(b.status))
			.sort((a, b) => a.start.localeCompare(b.start));
		const current = stays.find((b) => b.start <= today && b.end > today) ?? stays.find((b) => b.status === 'checkedin');
		const next = stays.find((b) => b.start > today);
		const block = this.blocked().find((bl) => bl.room === room.number && bl.end > today);
		return {
			...hover,
			description: this._typeDescriptions().get(room.type) ?? '',
			current,
			next,
			// A block's end is exclusive in the grid; people read the last blocked day.
			block: block ? { ...block, last: addDays(block.end, -1) } : undefined,
		};
	});

	private _toastTimer?: ReturnType<typeof setTimeout>;
	private _dragId: string | null = null;
	/** Submission id already taken from the URL, so a re-run of the effect doesn't open it twice. */
	private _handledSubmission: string | null = null;
	private readonly _queryParams = toSignal(this._route.queryParamMap);

	/** Stays that share a night with another stay or a room block in the same room (an import or a channel can create them). */
	protected readonly conflictIds = computed(() => {
		const ids = new Set<string>();
		const byRoom = new Map<string, Booking[]>();
		for (const b of this.bookings()) {
			if (!holdsRoom(b.status)) continue;
			byRoom.set(b.room, [...(byRoom.get(b.room) ?? []), b]);
		}
		for (const [room, list] of byRoom) {
			const blocks = this.blocked().filter((bl) => bl.room === room);
			list.forEach((b, i) => {
				if (blocks.some((bl) => overlaps(b, bl))) ids.add(b.id);
				for (const other of list.slice(i + 1)) {
					if (overlaps(b, other)) {
						ids.add(b.id);
						ids.add(other.id);
					}
				}
			});
		}
		return ids;
	});

	/**
	 * Night audit: guests still in the house after their check-out day, and stays whose arrival day
	 * has passed without a check-in (same rules as the Dashboard's "Потребує уваги").
	 */
	protected readonly auditItems = computed<AuditItem[]>(() => {
		const today = this.TODAY;
		const items: AuditItem[] = [];
		for (const b of this.bookings()) {
			if (b.status === 'checkedin' && b.end < today) items.push({ booking: b, kind: 'overstay' });
			else if ((b.status === 'pending' || b.status === 'confirmed') && b.start < today && b.end > today) items.push({ booking: b, kind: 'no-show' });
		}
		return items.sort((a, b) => a.booking.start.localeCompare(b.booking.start));
	});

	/** Room types in the order their first room appears. */
	protected readonly groupOrder = computed(() => [...new Set(this.rooms().map((r) => r.type))]);
	protected readonly rangeLabel = computed(() => monthLabel(this.viewStart()));
	protected readonly dateRange = computed(() =>
		Array.from({ length: this.viewDays() }, (_, i) => addDays(this.viewStart(), i)),
	);
	protected readonly visibleRooms = computed(() => this.rooms().filter((r) => !this.hiddenTypes().has(r.type)));
	protected readonly visibleBookings = computed(() => this.bookings().filter((b) => this.statusFilter().has(b.status)));

	protected readonly gridRows = computed(() => {
		const rows: ({ kind: 'group'; label: string; row: number; collapsed: boolean; count: number } | { kind: 'room'; room: Room; row: number })[] = [];
		const collapsed = this.collapsedTypes();
		let row = 2;
		for (const type of this.groupOrder()) {
			const list = this.visibleRooms().filter((r) => r.type === type);
			if (!list.length) continue;
			rows.push({ kind: 'group', label: type, row, collapsed: collapsed.has(type), count: list.length });
			row++;
			if (collapsed.has(type)) continue;
			for (const r of list) {
				rows.push({ kind: 'room', room: r, row });
				row++;
			}
		}
		return rows;
	});

	protected readonly bookingBlocks = computed(() => {
		const dates = this.dateRange();
		const rowsByRoom = new Map(
			this.gridRows()
				.filter((r): r is { kind: 'room'; room: Room; row: number } => r.kind === 'room')
				.map((r) => [r.room.number, r.row]),
		);
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const conflicts = this.conflictIds();
		/** Conflicting stays split their row: the earlier one on top, the next one below. */
		const lanes = new Map<string, number>();
		const blocks: {
			booking: Booking;
			row: number;
			colStart: number;
			colEnd: number;
			match: boolean;
			insetLeft: number;
			insetRight: number;
			stage: Stage;
			lane: 'top' | 'bottom' | null;
			badges: Badge[];
		}[] = [];
		// Earlier stays first, so conflict lanes alternate by date.
		const sorted = [...this.visibleBookings()].sort((a, b) => a.start.localeCompare(b.start));
		for (const b of sorted) {
			const row = rowsByRoom.get(b.room);
			if (row === undefined) continue;
			const rawStart = dayDiff(this.viewStart(), b.start);
			const rawEnd = dayDiff(this.viewStart(), b.end);
			const s = Math.max(0, rawStart);
			const e = Math.min(dates.length, rawEnd);
			if (e <= 0 || s >= dates.length) continue;
			const match = !!q && (b.name + ' ' + b.phone + ' ' + b.room + ' #' + b.id).toLocaleLowerCase('uk-UA').includes(q);
			const showCheckinEdge = rawStart >= 0 && rawStart < dates.length;
			const showCheckoutEdge = rawEnd >= 0 && rawEnd < dates.length;
			const colStart = s + 2;
			const colEnd = showCheckoutEdge ? e + 3 : e + 2;
			const totalCols = colEnd - colStart;
			const checkoutHour = b.lateCheckoutHour ?? CHECKOUT_HOUR;
			const insetLeft = showCheckinEdge ? (CHECKIN_HOUR / 24 / totalCols) * 100 : 0;
			const insetRight = showCheckoutEdge ? ((24 - checkoutHour) / 24 / totalCols) * 100 : 0;
			let lane: 'top' | 'bottom' | null = null;
			if (conflicts.has(b.id)) {
				const n = lanes.get(b.room) ?? 0;
				lanes.set(b.room, n + 1);
				lane = n % 2 === 0 ? 'top' : 'bottom';
			}
			blocks.push({ booking: b, row, colStart, colEnd, match, insetLeft, insetRight, stage: this.stageOf(b), lane, badges: this.badges(b) });
		}
		return blocks;
	});

	/** The day cell under the pointer; a click there starts a one-night booking. */
	private readonly _ghost = signal<{ room: string; date: string } | null>(null);

	/** What that booking would look like: placed like a real block (check-in 14:00, check-out 11:00), so the hover and the result match. */
	protected readonly ghostBlock = computed(() => {
		const ghost = this._ghost();
		if (!ghost) return null;
		const dates = this.dateRange();
		const row = this.gridRows().find((r) => r.kind === 'room' && r.room.number === ghost.room)?.row;
		if (row === undefined) return null;
		const end = addDays(ghost.date, 1);
		const rawStart = dayDiff(this.viewStart(), ghost.date);
		if (rawStart < 0 || rawStart >= dates.length) return null;
		const showCheckoutEdge = rawStart + 1 < dates.length;
		const colStart = rawStart + 2;
		const colEnd = showCheckoutEdge ? rawStart + 4 : rawStart + 3;
		const totalCols = colEnd - colStart;
		return {
			row,
			colStart,
			colEnd,
			start: ghost.date,
			end,
			insetLeft: (CHECKIN_HOUR / 24 / totalCols) * 100,
			insetRight: showCheckoutEdge ? ((24 - CHECKOUT_HOUR) / 24 / totalCols) * 100 : 0,
		};
	});

	protected showGhost(room: string, date: string): void {
		this._ghost.set(this.ready() && !this.occupied(room, date) ? { room, date } : null);
	}

	protected hideGhost(): void {
		this._ghost.set(null);
	}

	protected readonly blockedOverlays = computed(() => {
		const dates = this.dateRange();
		const rowsByRoom = new Map(
			this.gridRows()
				.filter((r): r is { kind: 'room'; room: Room; row: number } => r.kind === 'room')
				.map((r) => [r.room.number, r.row]),
		);
		return this.blocked()
			.map((bl) => {
				const row = rowsByRoom.get(bl.room);
				if (row === undefined) return null;
				const s = Math.max(0, dayDiff(this.viewStart(), bl.start));
				const e = Math.min(dates.length, dayDiff(this.viewStart(), bl.end));
				if (e <= 0 || s >= dates.length) return null;
				return { ...bl, row, colStart: s + 2, colEnd: e + 2, kind: blockKind(bl.reason), label: blockLabel(bl.reason) };
			})
			.filter((x): x is NonNullable<typeof x> => x !== null);
	});

	protected readonly mobileRoomCards = computed(() => {
		const dates = Array.from({ length: this.mobileDays() }, (_, i) => addDays(this.mobileDate(), i));
		return this.rooms().map((r) => {
			const booking = this.bookings().find(
				(x) => x.room === r.number && holdsRoom(x.status) && dates.some((d) => d >= x.start && d < x.end),
			);
			const blocked = this.blocked().find((x) => x.room === r.number && dates.some((d) => d >= x.start && d < x.end));
			return { room: r, booking, blocked };
		});
	});

	protected readonly formRoom = computed(() => this.rooms().find((r) => r.number === this.bookingForm().room));
	protected readonly formNights = computed(() => {
		const { start, end } = this.bookingForm();
		return start && end ? Math.max(0, dayDiff(start, end)) : 0;
	});
	protected readonly formAutoTotal = computed(() => this.formNights() * (this.formRoom()?.price ?? 0));
	protected readonly formTotal = computed(() => this.bookingForm().total ?? this.formAutoTotal());

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

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!this.live || !hotelId) return;
			this.rooms.set([]);
			this._bookings.set([]);
			this._blocks.set([]);
			this._roomsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			this.selectedId.set(null);
			this.hiddenTypes.set(new Set());
			this._guestTags.set(new Map());
			const onError = (error: Error) => {
				// Most often missing rules for hotels/{id}/bookings: deploy firestore.rules.
				console.error('Calendar listener failed', error);
				this.loadError.set('Не вдалося завантажити календар. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopRooms = this._roomsService.listenRooms(
				hotelId,
				(records) => {
					this.rooms.set(records.map(toRoom));
					this._blocks.set(
						records
							.filter((r) => r.block)
							// A room block's last day is inclusive; the calendar's ranges end on the departure day.
							.map((r) => ({ room: r.number, start: r.block!.start, end: addDays(r.block!.end, 1), reason: r.block!.reason, note: r.block!.note })),
					);
					this._roomsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(records) => {
					this._bookings.set(records.map(toBooking));
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			// Guest tags only decorate the blocks (VIP, blacklist); the calendar works without them.
			const stopGuests = this._guestsService.listen(
				hotelId,
				(guests) => this._guestTags.set(new Map(guests.map((g) => [g.id, g.tags]))),
				(error) => console.error('Guest tags listener failed', error),
			);
			// Type descriptions only fill the room tooltip.
			const stopTypes = this._roomsService.listenTypes(
				hotelId,
				(types) => this._typeDescriptions.set(new Map(types.map((t) => [t.name, t.description]))),
				(error) => console.error('Room types listener failed', error),
			);
			onCleanup(() => {
				stopRooms();
				stopBookings();
				stopGuests();
				stopTypes();
			});
		});

		// "Create booking" on a submission lands here as /calendar?submission=<id>.
		effect(() => {
			const submissionId = this._queryParams()?.get('submission');
			const hotelId = this.hotelId();
			if (!submissionId || !hotelId || !this.live || !this.ready() || submissionId === this._handledSubmission) return;
			this._handledSubmission = submissionId;
			untracked(() => void this._startFromSubmission(hotelId, submissionId));
		});
	}

	protected booking(id: string): Booking | undefined {
		return this.bookings().find((b) => b.id === id);
	}

	protected roomOf(number: string): Room | undefined {
		return this.rooms().find((r) => r.number === number);
	}

	protected occupied(room: string, date: string): boolean {
		const nextDay = addDays(date, 1);
		if (this.blocked().some((bl) => bl.room === room && date < bl.end && nextDay > bl.start)) return true;
		return this.bookings().some((b) => b.room === room && holdsRoom(b.status) && date < b.end && nextDay > b.start);
	}

	private bookingsOverlap(room: string, start: string, end: string, excludeId: string | null): boolean {
		if (this.blocked().some((bl) => bl.room === room && start < bl.end && end > bl.start)) return true;
		return this.bookings().some(
			(b) => b.room === room && b.id !== excludeId && holdsRoom(b.status) && start < b.end && end > b.start,
		);
	}

	protected stageOf(b: Booking): Stage {
		if (b.status === 'cancelled' || b.status === 'waitlist') return b.status;
		if (this.conflictIds().has(b.id)) return 'conflict';
		if (b.status === 'checkedout') return 'checkedout';
		if (b.status === 'checkedin') return b.end <= this.TODAY ? 'departing' : 'staying';
		if (b.start <= this.TODAY) return 'arriving';
		// Money taken is finance data: roles without the guest bill see a plain booking.
		return this.showFinance && b.paid > 0 ? 'prepaid' : 'booking';
	}

	/** Small marks inside a block, in the order the eye should read them: people first, then money, then terms. */
	protected badges(b: Booking): Badge[] {
		const list: Badge[] = [];
		if (b.blacklisted) list.push({ icon: 'ban', title: 'Гість у чорному списку' });
		if (b.vip) list.push({ icon: 'star', title: 'VIP-гість' });
		if (this.showFinance && holdsRoom(b.status) && b.paid < b.total) list.push({ icon: 'coin', title: `Борг гостя: ${money(b.total - b.paid)}` });
		if (b.companyOperator) list.push({ icon: 'briefcase', title: `Платить компанія: ${b.companyOperator}` });
		if (b.guarantee === 'Гарантована') list.push({ icon: 'shield', title: 'Гарантована оплата' });
		if (b.mealPlan && !b.mealPlan.includes('(RO)')) list.push({ icon: 'meal', title: `Харчування: ${b.mealPlan}` });
		const roomType = this.roomOf(b.room)?.type;
		if (b.rateCategory && roomType && b.rateCategory !== roomType) {
			list.push({ icon: 'swap', title: `Оплачено як «${b.rateCategory}», живе в «${roomType}»` });
		}
		if (b.roomLocked) list.push({ icon: 'lock', title: 'Номер закріплено за гостем' });
		if (b.lateCheckoutHour) list.push({ icon: 'clock', title: `Пізній виїзд до ${b.lateCheckoutHour}:00` });
		return list;
	}

	/** Marks for the booking hover card, without the ones its rows already say: debt (Баланс), company, meal plan, late check-out. */
	protected cardMarks(b: Booking): Badge[] {
		return this.badges(b).filter((m) => !['coin', 'briefcase', 'meal', 'clock'].includes(m.icon));
	}

	/** Marks for the side panel: debt is left out where the "Оплата" block already shows it. */
	protected panelMarks(b: Booking): Badge[] {
		return this.badges(b).filter((m) => !(this.showFinance && m.icon === 'coin'));
	}

	/** Number shown on the block: the channel's number when there is one, else the booking id (shortened for Firestore ids). */
	protected bookingNo(b: Booking): string {
		if (b.externalNumber) return '№' + b.externalNumber;
		return '№' + (this.live ? b.id.slice(0, 6).toUpperCase() : b.id);
	}

	protected alternativesFor(type: string, start: string, end: string, excludeRoom: string, excludeId?: string): Room[] {
		return this.rooms().filter(
			(r) => r.type === type && r.number !== excludeRoom && !this.bookingsOverlap(r.number, start, end, excludeId ?? null),
		);
	}

	protected prevRange(): void {
		this.viewStart.set(addDays(this.viewStart(), -this.viewDays()));
	}

	protected nextRange(): void {
		this.viewStart.set(addDays(this.viewStart(), this.viewDays()));
	}

	protected prevMonth(): void {
		this.viewStart.set(addMonths(this.viewStart(), -1));
	}

	protected nextMonth(): void {
		this.viewStart.set(addMonths(this.viewStart(), 1));
	}

	protected goToDate(date: string): void {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
		this.viewStart.set(date);
		this.mobileDate.set(date);
	}

	protected goToday(): void {
		this.viewStart.set(addDays(this.TODAY, -1));
		this.mobileDate.set(this.TODAY);
	}

	protected toggleCompact(): void {
		this.compact.set(!this.compact());
		writeFlag(COMPACT_KEY, this.compact());
	}

	protected toggleLegend(): void {
		this.legendOpen.set(!this.legendOpen());
		writeFlag(LEGEND_KEY, this.legendOpen());
	}

	/** Night audit item: show the stay in the grid and open it. */
	protected openAuditItem(item: AuditItem): void {
		this.auditOpen.set(false);
		const first = this.viewStart();
		if (item.booking.start < first || item.booking.start >= addDays(first, this.viewDays())) this.viewStart.set(item.booking.start);
		this.openSidePanel(item.booking.id);
	}

	protected setViewDays(days: number): void {
		this.viewDays.set(days);
	}

	protected mobilePrev(): void {
		this.mobileDate.set(addDays(this.mobileDate(), -this.mobileDays()));
	}

	protected mobileNext(): void {
		this.mobileDate.set(addDays(this.mobileDate(), this.mobileDays()));
	}

	protected setMobileDays(days: number): void {
		this.mobileDays.set(days);
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleStatusFilter(status: Status, checked: boolean): void {
		this.statusFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(status) : next.delete(status);
			return next;
		});
	}

	protected toggleGroup(type: string): void {
		this.collapsedTypes.update((set) => {
			const next = new Set(set);
			next.has(type) ? next.delete(type) : next.add(type);
			return next;
		});
	}

	protected toggleTypeFilter(type: string, checked: boolean): void {
		this.hiddenTypes.update((set) => {
			const next = new Set(set);
			checked ? next.delete(type) : next.add(type);
			return next;
		});
	}

	protected resetFilters(): void {
		this.statusFilter.set(new Set<Status>(ALL_STATUSES));
		this.hiddenTypes.set(new Set());
	}

	protected onDayCellClick(room: string, date: string): void {
		if (!this.ready() || this.occupied(room, date)) return;
		this.openQuickBooking(room, date);
	}

	private _emptyForm(start: string, room = ''): BookingForm {
		return {
			firstName: '',
			lastName: '',
			phone: '',
			email: '',
			room,
			guests: 2,
			start,
			end: addDays(start, 1),
			total: null,
			source: this.live ? 'Пряме бронювання' : SOURCES[0],
			payment: 'none',
			method: this.paymentMethods()[0]?.value ?? 'cash',
			status: this.canChange ? 'confirmed' : 'pending',
			notes: '',
			submission: null,
		};
	}

	protected patchForm(patch: Partial<BookingForm>): void {
		this.bookingForm.update((f) => ({ ...f, ...patch }));
	}

	/** Moving the check-in keeps the stay's length; the check-out is moved with it. */
	protected setFormStart(start: string): void {
		const { start: oldStart, end } = this.bookingForm();
		const nights = oldStart && end ? dayDiff(oldStart, end) : 1;
		this.patchForm({ start, end: start ? addDays(start, Math.max(1, nights)) : end });
	}

	/** A cancelled stay booked again: the form opens with the same guest, room and dates (a busy room offers alternatives on save). */
	protected rebook(b: Booking): void {
		if (!this.ready()) return;
		this.closeSidePanel();
		this.formError.set('');
		this.bookingForm.set({
			...this._emptyForm(b.start, b.room),
			...splitName(b.name),
			phone: b.phone,
			email: b.email,
			guests: b.guests,
			end: b.end,
			source: b.source || this._emptyForm(b.start).source,
		});
		this.dialogView.set({ kind: 'quick-booking' });
	}

	protected openQuickBooking(room: string | null, date: string): void {
		if (!this.ready()) return;
		this.formError.set('');
		this.bookingForm.set(this._emptyForm(date, room ?? this.rooms()[0]?.number ?? ''));
		this.dialogView.set({ kind: 'quick-booking' });
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

	protected openSidePanel(id: string): void {
		this.selectedId.set(id);
	}

	protected closeSidePanel(): void {
		this.selectedId.set(null);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	/** " · Демо" suffix for toasts of actions that only change local demo data. */
	private get demoTag(): string {
		return this.live ? '' : ' · Демо';
	}

	protected showHover(event: MouseEvent, booking: Booking): void {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		// Below the block; above it when the card would run off the bottom of the screen.
		const below = rect.bottom + 8;
		const y = below + 470 > window.innerHeight ? Math.max(8, rect.top - 478) : below;
		this.hover.set({ booking, x: Math.max(8, Math.min(window.innerWidth - 326, rect.left)), y });
	}

	/** Arrival time: as planned on the booking, else the hotel's check-in hour. */
	protected checkInLabel(b: Booking): string {
		return b.checkInTime || `${CHECKIN_HOUR}:00`;
	}

	/** Departure time: a late check-out wins, then the planned time, then the hotel's check-out hour. */
	protected checkOutTimeLabel(b: Booking): string {
		if (b.lateCheckoutHour) return `${String(b.lateCheckoutHour).padStart(2, '0')}:00`;
		return b.checkOutTime || `${CHECKOUT_HOUR}:00`;
	}

	/** `пн, 12 жовт.` plus `сьогодні` / `завтра` / `вчора` when close, so arrivals and departures read at a glance. */
	protected dayLabel(date: string): string {
		const full = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toDate(date));
		const near = ({ [-1]: 'вчора', 0: 'сьогодні', 1: 'завтра' } as Record<number, string>)[dayDiff(this.TODAY, date)];
		return near ? `${full} · ${near}` : full;
	}

	/** `2 дорослих, 1 дитина` when the split is known, else the head count. */
	protected peopleLabel(b: Booking): string {
		if (b.adults === undefined) return guestsLabel(b.guests);
		const adults = `${b.adults} ${plural(b.adults, 'дорослий', 'дорослих', 'дорослих')}`;
		const kids = b.children ? `, ${b.children} ${plural(b.children, 'дитина', 'дитини', 'дітей')}` : '';
		return adults + kids;
	}

	protected hideHover(): void {
		this.hover.set(null);
	}

	/** Room tooltip right of the room cell, kept on screen near the bottom edge. */
	protected showRoomHover(event: MouseEvent, room: Room): void {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		this.roomHover.set({ room, x: rect.right + 8, y: Math.max(8, Math.min(rect.top, window.innerHeight - 600)) });
	}

	/**
	 * How many more people fit with `guests` already in the room: free main places first, then extra places
	 * (each charged at the room's extra-guest price). `paid` is how many of those would be extra.
	 */
	protected addable(room: Room, guests: number): { total: number; paid: number } {
		const freeMain = Math.max(0, room.capacity - guests);
		const usedExtra = Math.max(0, guests - room.capacity);
		const paid = Math.max(0, room.extraGuests - usedExtra);
		return { total: freeMain + paid, paid };
	}

	protected hideRoomHover(): void {
		this.roomHover.set(null);
	}

	protected onDragStart(event: DragEvent, id: string): void {
		if (!this.canChange) return event.preventDefault();
		this._dragId = id;
		event.dataTransfer?.setData('text/plain', id);
	}

	protected onDragOver(event: DragEvent): void {
		event.preventDefault();
	}

	protected onDrop(event: DragEvent, room: string, date: string): void {
		event.preventDefault();
		const id = this._dragId;
		this._dragId = null;
		if (id == null || !this.canChange) return;
		const b = this.booking(id);
		if (!b) return;
		const nights = dayDiff(b.start, b.end);
		const newStart = date;
		const newEnd = addDays(newStart, nights);
		if (room === b.room && newStart === b.start) return;
		if (b.roomLocked && room !== b.room) {
			this.toast(`Номер ${b.room} закріплено за гостем: змініть дати в цьому ж номері або зніміть закріплення в картці бронювання.`);
			return;
		}
		if (this.bookingsOverlap(room, newStart, newEnd, b.id)) {
			this.dialogView.set({ kind: 'conflict', room, start: newStart, end: newEnd, type: this.roomOf(room)!.type, moveId: b.id });
			return;
		}
		this.pendingMove.set({ id: b.id, room, start: newStart, end: newEnd });
		this.dialogView.set({ kind: 'confirm-move' });
	}

	protected async applyPendingMove(): Promise<void> {
		const m = this.pendingMove();
		const room = m && this.roomOf(m.room);
		if (!m || !room || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(
			m.id,
			{ roomId: room.id, roomNumber: room.number, checkIn: m.start, checkOut: m.end },
			{ room: room.number, roomId: room.id, start: m.start, end: m.end },
		);
		this.saving.set(false);
		if (!saved) return;
		this.pendingMove.set(null);
		this.closeDialog();
		this.toast('Бронювання переміщено' + this.demoTag);
	}

	/** Conflict dialog: a booking being moved goes to the free room; a new booking returns to the form with it. */
	protected pickAlternative(room: string, view: { start: string; end: string; moveId?: string }): void {
		if (view.moveId) {
			this.pendingMove.set({ id: view.moveId, room, start: view.start, end: view.end });
			this.dialogView.set({ kind: 'confirm-move' });
			return;
		}
		this.patchForm({ room, total: null });
		this.formError.set('');
		this.dialogView.set({ kind: 'quick-booking' });
	}

	/** Free room closest to what a website request asked for: its type first, then any room that fits. */
	private _suggestRoom(type: string, start: string, end: string, guests: number): string {
		const rooms = this.rooms();
		const free = (r: Room) => !this.bookingsOverlap(r.number, start, end, null);
		const fits = (r: Room) => r.capacity >= guests;
		const sameType = rooms.filter((r) => r.type === type);
		return (
			(sameType.find((r) => free(r) && fits(r)) ?? sameType.find(free) ?? rooms.find((r) => free(r) && fits(r)) ?? rooms.find(free) ?? rooms[0])
				?.number ?? ''
		);
	}

	private async _startFromSubmission(hotelId: string, submissionId: string): Promise<void> {
		// Drop the id from the URL so a reload doesn't open the form again.
		this._router.navigate([], { queryParams: { submission: null }, queryParamsHandling: 'merge', replaceUrl: true });
		let submission: SubmissionRecord | null = null;
		try {
			submission = await this._submissionsService.get(hotelId, submissionId);
		} catch (error) {
			console.error('Submission load failed', error);
		}
		if (!submission) {
			this.toast('Не вдалося відкрити заявку. Створіть бронювання вручну.');
			return;
		}
		if (!this.rooms().length) {
			this.toast('Спершу додайте номери на сторінці «Номери».');
			return;
		}
		const start = submission.checkIn || this.TODAY;
		const end = submission.checkOut && submission.checkOut > start ? submission.checkOut : addDays(start, 1);
		const guests = Math.max(1, submission.guests ?? 1);
		this.formError.set('');
		this.bookingForm.set({
			...this._emptyForm(start),
			...splitName(submission.name),
			phone: submission.phone,
			email: submission.email,
			room: this._suggestRoom(submission.roomType, start, end, guests),
			guests,
			start,
			end,
			source: 'Сайт',
			notes: submission.message,
			submission: {
				id: submission.id,
				label: submission.name || submission.phone,
				message: submission.message,
				roomType: submission.roomType,
			},
		});
		this.viewStart.set(start);
		this.mobileDate.set(start);
		this.dialogView.set({ kind: 'quick-booking' });
	}

	protected async submitBooking(): Promise<void> {
		if (this.saving()) return;
		const f = this.bookingForm();
		const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim();
		const phone = f.phone.trim();
		const room = this.roomOf(f.room);
		const guests = Number(f.guests);
		if (!name && !phone) return this.formError.set('Вкажіть ім’я або телефон гостя.');
		if (!room) return this.formError.set('Оберіть номер.');
		if (!f.start || !f.end || f.end <= f.start) return this.formError.set('Виїзд має бути після заїзду.');
		if (!Number.isInteger(guests) || guests < 1) return this.formError.set('Вкажіть кількість гостей.');
		if (this.live && guests > room.capacity) {
			return this.formError.set(`У номері ${room.number} може жити не більше ${guestsLabel(room.capacity)}.`);
		}
		// A waitlisted stay waits for this very room, so it may overlap.
		const waitlist = this.canChange && f.status === 'waitlist';
		if (!waitlist && this.bookingsOverlap(room.number, f.start, f.end, null)) {
			this.dialogView.set({ kind: 'conflict', room: room.number, start: f.start, end: f.end, type: room.type });
			return;
		}

		const total = Math.max(0, Math.round(this.formTotal()));
		const paid = !this.canCollect || waitlist ? 0 : f.payment === 'full' ? total : f.payment === 'half' ? Math.round(total / 2) : 0;
		const input: BookingInput = {
			roomId: room.id,
			roomNumber: room.number,
			guestName: name || phone,
			phone,
			email: f.email.trim(),
			checkIn: f.start,
			checkOut: f.end,
			guests,
			total,
			paid,
			// Only roles that may change bookings confirm one; Sales creates a hold.
			status: this.canChange ? f.status : 'pending',
			source: f.source,
			notes: f.notes.trim(),
			...(f.submission ? { submissionId: f.submission.id } : {}),
		};

		this.formError.set('');
		const hotelId = this.hotelId();
		if (this.live && hotelId) {
			this.saving.set(true);
			// Link the booking to the guest's profile (found by phone, or created). A failure here must not lose the booking:
			// Guests → "Створити профілі з бронювань" links it later.
			try {
				input.guestId = await this._guestsService.ensure(hotelId, { name: input.guestName, phone: input.phone, email: input.email });
			} catch (error) {
				console.error('Guest lookup failed', error);
			}
			let id: string;
			try {
				id = await this._bookingsService.add(hotelId, input, paid > 0 ? { method: f.method, recorder: this._paymentsService.recorder() } : undefined);
			} catch (error) {
				console.error('Booking create failed', error);
				this.saving.set(false);
				return this.formError.set('Не вдалося створити бронювання. Перевірте зʼєднання та спробуйте ще раз.');
			}
			let submissionSaved = true;
			if (f.submission) {
				try {
					await this._submissionsService.updateStatus(f.submission.id, 'booked', `Створено бронювання · номер ${room.number}`);
				} catch (error) {
					console.error('Submission status update failed', error);
					submissionSaved = false;
				}
			}
			this.saving.set(false);
			this._afterCreate(input.checkIn, id);
			this.toast(
				submissionSaved ? `Бронювання створено · номер ${room.number}` : 'Бронювання створено, але статус заявки не змінено. Змініть його вручну в Заявках.',
			);
			return;
		}

		const id = String(Math.max(0, ...this._bookings().map((b) => Number(b.id) || 0)) + 1);
		this._bookings.update((bs) => [
			...bs,
			{
				id,
				room: input.roomNumber,
				roomId: input.roomId,
				name: input.guestName,
				phone: input.phone,
				email: input.email,
				start: input.checkIn,
				end: input.checkOut,
				guests: input.guests,
				total: input.total,
				paid: input.paid,
				status: input.status,
				source: input.source,
				notes: input.notes,
			},
		]);
		this._afterCreate(input.checkIn, id);
		this.toast('Бронювання створено · #' + id);
	}

	private _afterCreate(start: string, id: string): void {
		this.closeDialog();
		// Show the new stay: jump to it when it starts outside the visible range.
		const first = this.viewStart();
		if (start < first || start >= addDays(first, this.viewDays())) this.viewStart.set(start);
		this.selectedId.set(id);
	}

	/** Saves a change: to Firestore for a real hotel, to the local seed list in the demo. */
	private async _save(id: string, patch: BookingPatch, local: Partial<Booking>): Promise<boolean> {
		const hotelId = this.hotelId();
		if (this.live && hotelId) {
			try {
				await this._bookingsService.update(hotelId, id, patch);
				return true;
			} catch (error) {
				console.error('Booking update failed', error);
				this.toast('Не вдалося зберегти зміни. Перевірте зʼєднання та спробуйте ще раз.');
				return false;
			}
		}
		this._bookings.update((bs) => bs.map((b) => (b.id === id ? { ...b, ...local } : b)));
		return true;
	}

	protected async submitPayment(id: string, amount: number, method: PaymentMethod): Promise<void> {
		const b = this.booking(id);
		if (!b || !this.canCollect || !(amount > 0) || amount > b.total - b.paid || this.saving()) return;
		this.saving.set(true);
		let saved: boolean;
		const hotelId = this.hotelId();
		if (this.live && hotelId) {
			// Live: an entry in the payment journal, which also adds the amount to the booking's paid.
			try {
				await this._paymentsService.record(hotelId, { id, guestName: b.name, roomNumber: b.room }, { amount, method, note: '', occurredOn: localDay(new Date()) });
				saved = true;
			} catch (error) {
				console.error('Payment record failed', error);
				this.toast('Не вдалося записати оплату. Перевірте зʼєднання та спробуйте ще раз.');
				saved = false;
			}
		} else {
			saved = await this._save(id, { paid: b.paid + amount }, { paid: b.paid + amount });
		}
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.openSidePanel(id);
		this.toast('Оплату додано · ' + money(amount));
	}

	protected submitMessage(): void {
		this.closeDialog();
		this.toast('Чернетку повідомлення підготовлено · Демо');
	}

	protected readonly stayActions = stayActions;
	protected readonly STAY_ACTION_LABEL = STAY_ACTION_LABEL;

	/** Поселити / Виселити / В лист очікування / Анулювати; cancelling asks first. */
	protected runStayAction(id: string, action: StayAction): void {
		if (action === 'cancel') return this.askCancel(id);
		void this.setStatus(id, ({ checkin: 'checkedin', checkout: 'checkedout', waitlist: 'waitlist' } as const)[action]);
	}

	protected askCancel(id: string): void {
		if (this.canChange) this.dialogView.set({ kind: 'cancel', bookingId: id });
	}

	protected async cancelBooking(id: string): Promise<void> {
		if (!this.canChange || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { status: 'cancelled' }, { status: 'cancelled' });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.closeSidePanel();
		this.toast('Бронювання анульовано' + this.demoTag);
	}

	protected async setStatus(id: string, status: Status): Promise<void> {
		if (!this.canChange || this.saving()) return;
		const b = this.booking(id);
		// Off the waitlist only into a free room: otherwise the stay would double-book it.
		if (b?.status === 'waitlist' && holdsRoom(status) && this.bookingsOverlap(b.room, b.start, b.end, b.id)) {
			this.toast(`Номер ${b.room} ще зайнятий на ці дати. Перетягніть бронювання у вільний номер, потім підтвердіть.`);
			return;
		}
		this.saving.set(true);
		// Checking out before the booked departure frees the remaining nights; the booked date is kept.
		const out = status === 'checkedout' && b ? checkOutPatch({ checkIn: b.start, checkOut: b.end, plannedCheckOut: b.plannedCheckOut }, this.TODAY) : null;
		const earlyEnd = out?.early ?? '';
		const early = !!out?.early;
		const patch: BookingPatch = out ? out.patch : { status };
		const local: Partial<Booking> = out
			? { status, ...(out.early ? { end: out.early, plannedCheckOut: out.patch.plannedCheckOut } : {}) }
			: { status };
		const saved = await this._save(id, patch, local);
		let roomMarked = true;
		if (saved && status === 'checkedout') roomMarked = await this._markRoomForCleaning(id);
		this.saving.set(false);
		if (!saved) return;
		if (!roomMarked) {
			this.toast('Виїзд відмічено, але статус номера не змінено. Позначте номер як «Потребує прибирання» на сторінці «Номери».');
		} else {
			this.toast(
				{ checkedin: 'Заїзд відмічено', checkedout: early ? `Виїзд відмічено · номер вільний з ${shortDate(earlyEnd)}, потребує прибирання` : 'Виїзд відмічено · номер потребує прибирання', pending: '', confirmed: 'Бронювання підтверджено', cancelled: '', waitlist: 'Бронювання перенесено в лист очікування' }[status],
			);
		}
	}

	/** After check-out the room waits for cleaning (a blocked room stays blocked). Real hotels only; the demo has no room statuses here. */
	private async _markRoomForCleaning(bookingId: string): Promise<boolean> {
		const hotelId = this.hotelId();
		const room = this.rooms().find((r) => r.number === this.booking(bookingId)?.room);
		if (!this.live || !hotelId || !room || room.status === 'unavailable') return true;
		try {
			await this._roomsService.updateRoom(hotelId, room.id, { status: 'needs-cleaning' });
			return true;
		} catch (error) {
			console.error('Room status update failed', error);
			return false;
		}
	}

	protected requestRoomChange(): void {
		this.toast('Оберіть новий номер перетягнувши бронювання в календарі' + this.demoTag);
	}

	protected checkoutHourOf(b: Booking): number {
		return b.lateCheckoutHour ?? CHECKOUT_HOUR;
	}

	protected checkoutLabel(b: Booking): string {
		const hour = this.checkoutHourOf(b);
		return `${String(hour).padStart(2, '0')}:00`;
	}

	protected canExtendStay(b: Booking): boolean {
		if (!this.canChange || !holdsRoom(b.status)) return false;
		const roomTakenAfter = this.bookings().some(
			(x) => x.id !== b.id && x.room === b.room && holdsRoom(x.status) && x.start === b.end,
		);
		const blockedAfter = this.blocked().some((bl) => bl.room === b.room && bl.start === b.end);
		return !roomTakenAfter && !blockedAfter;
	}

	protected openExtendStay(id: string): void {
		this.dialogView.set({ kind: 'extend-stay', bookingId: id });
	}

	/** Продовжити проживання: a later check-out date; the price per night stays, the total follows the nights. */
	protected readonly extendEnd = signal('');

	protected canExtendNights(b: Booking): boolean {
		return this.canChange && holdsRoom(b.status);
	}

	protected openExtendNights(id: string): void {
		const b = this.booking(id);
		if (!b) return;
		this.extendEnd.set(addDays(b.end, 1));
		this.dialogView.set({ kind: 'extend-nights', bookingId: id });
	}

	protected extendedTotal(b: Booking, end: string): number {
		const was = dayDiff(b.start, b.end);
		return was > 0 ? Math.round((b.total / was) * dayDiff(b.start, end)) : b.total;
	}

	/** Why the new check-out cannot be saved, or '' when it can. */
	protected extendError(b: Booking, end: string): string {
		if (!end || end <= b.end) return 'Новий виїзд має бути пізніше за поточний.';
		if (dayDiff(b.start, end) > 90) return 'Не більше 90 ночей.';
		if (this.bookingsOverlap(b.room, b.end, end, b.id)) return `Номер ${b.room} зайнятий у ці дати. Продовжте менше або перенесіть гостя в інший номер.`;
		return '';
	}

	protected async submitExtendNights(id: string): Promise<void> {
		const b = this.booking(id);
		const end = this.extendEnd();
		if (!b || !this.canChange || this.saving() || this.extendError(b, end)) return;
		const total = this.extendedTotal(b, end);
		this.saving.set(true);
		const saved = await this._save(id, { checkOut: end, total }, { end, total });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.openSidePanel(id);
		this.toast(`Проживання продовжено до ${shortDate(end)} · ${money(total)}${this.demoTag}`);
	}

	protected async submitExtendStay(id: string, hour: number): Promise<void> {
		if (!this.canChange || this.saving()) return;
		this.saving.set(true);
		const saved = await this._save(id, { lateCheckoutHour: hour }, { lateCheckoutHour: hour });
		this.saving.set(false);
		if (!saved) return;
		this.closeDialog();
		this.openSidePanel(id);
		this.toast(`Пізній виїзд до ${String(hour).padStart(2, '0')}:00 підтверджено${this.demoTag}`);
	}
}
