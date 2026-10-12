import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { can, getDemoRole, isPageAllowed, ROLE_LABEL, type Role } from '../../shared/role';

interface AiAnswer {
	html: string;
	source?: string;
	noFeedback?: boolean;
}

interface ChatMessage {
	role: 'user' | 'ai';
	text?: string;
	html?: string;
	source?: string;
	noFeedback?: boolean;
	loading?: boolean;
	feedback?: 'up' | 'down' | null;
}

type DialogView = { kind: 'section' } | null;

interface Conversation {
	id: string;
	title: string;
	preview: string;
	time: string;
	messages: ChatMessage[];
}

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const esc = (s: string) => String(s);

/* ---- demo knowledge base ---- */
const KB = {
	arrivals: [
		{ time: '13:30', guest: 'Анна Коваленко', room: '204 · Люкс', payment: 'Оплачено', bookingId: 1842, note: 'Очікуваний час: 13:30' },
		{ time: '14:00', guest: 'Олег Бондар', room: '103 · Стандарт', payment: 'Залишок: 1 200 ₴', bookingId: 1847 },
		{ time: '16:30', guest: 'Марія Петренко', room: '202 · Люкс', payment: 'Оплачено', bookingId: 1853 },
	],
	departures: 4,
	occupied: 22,
	totalRooms: 28,
	needsCleaning: 3,
	unpaidTotal: 6200,
	unconfirmed: [{ guest: 'Ірина Шевченко', bookingId: 1851, dates: '19–22 вересня' }],
	cancelledThisMonth: [{ guest: 'Тарас Гончар', bookingId: 1810, reason: 'Гість відмовився' }],
	weekBookings: 5,
	tomorrowBookings: 2,
	freeWeekend: [
		{ number: '103', type: 'Стандарт', price: 1200 },
		{ number: '205', type: 'Люкс', price: 1800 },
		{ number: '301', type: 'Апартаменти', price: 2200 },
	],
	freeNow: [
		{ number: '103', type: 'Стандарт' },
		{ number: '205', type: 'Люкс' },
	],
	blockedRooms: [{ number: '302', reason: 'Ремонт', period: '17–19 вересня' }],
	roomStatus: { '204': 'Зайнятий (виїзд 20 вересня)', '205': 'Готовий, вільний', '103': 'Готовий, вільний' } as Record<string, string>,
	guests: {
		'анна коваленко': { name: 'Анна Коваленко', stays: 4, favType: 'Люкс', lastVisit: '20 серпня 2026', pref: 'Тихий номер', tag: 'Постійний гість', bookingId: 1842, room: '204 · Люкс', dates: '17–20 вересня', total: 4800, paid: 4800 },
		'олег бондар': { name: 'Олег Бондар', stays: 1, favType: 'Стандарт', lastVisit: '-', pref: '', tag: '', bookingId: 1847, room: '103 · Стандарт', dates: '17–18 вересня', total: 3200, paid: 2000 },
		'марія петренко': { name: 'Марія Петренко', stays: 8, favType: 'Люкс', lastVisit: '1 вересня 2026', pref: 'Високий поверх', tag: 'VIP', bookingId: 1853, room: '202 · Люкс', dates: '20–23 вересня', total: 7200, paid: 7200 },
	} as Record<string, { name: string; stays: number; favType: string; lastVisit: string; pref: string; tag: string; bookingId: number; room: string; dates: string; total: number; paid: number }>,
	ambiguous: { олександр: ['Олександр Мельник', 'Олександр Бондар', 'Олександр Коваль'] } as Record<string, string[]>,
	mostStays: { name: 'Марія Петренко', stays: 8 },
	longTimeGone: 18,
	newGuestsThisMonth: 86,
	unpaidBookings: [
		{ guest: 'Олег Бондар', bookingId: 1847, balance: 1200 },
		{ guest: 'Ірина Шевченко', bookingId: 1851, balance: 6400 },
	],
	receivedToday: 38400,
	depositsThisMonth: 24800,
	refunds: [{ guest: 'Марія Петренко', bookingId: 1812, amount: 2400 }],
	biggestBalance: { guest: 'Ірина Шевченко', bookingId: 1851, balance: 6400 },
	cleaning: {
		needs: [
			{ number: '204', arrival: '13:30', assigned: null as string | null },
			{ number: '207', arrival: '15:00', assigned: null as string | null },
		],
		inProgress: [{ number: '206', assigned: 'Марія', since: '12:20' }],
		ready: ['103', '205'],
	},
	unassignedTasks: 2,
	sales: { topSource: 'Пряме бронювання', topCount: 29, revenueMonth: 428600, instagram: { count: 15, revenue: 76200 }, directShare: 34, directSharePrev: 31, returning: 18 },
	roomPrices: { '204': { type: 'Люкс', price: 1600 }, '205': { type: 'Люкс', price: 1800 } } as Record<string, { type: string; price: number }>,
};

const SUGGESTIONS = [
	'Що сьогодні важливого?',
	'Хто сьогодні заїжджає?',
	'Які номери ще не готові?',
	'Хто має неоплачений залишок?',
	'Які номери вільні на вихідні?',
	'Хто наші постійні гості?',
	'Звідки приходить найбільше бронювань?',
	'Скільки ми отримали цього місяця?',
];

const INSIGHTS = [
	{ title: '5 вільних номерів на вихідні', text: 'Завантаження на наступні вихідні зараз 63%.', cta: 'Переглянути календар', href: '/calendar/' },
	{ title: '18 постійних гостей давно не поверталися', text: 'Ці гості мають мінімум 2 попередні проживання і не були у вас понад 6 місяців.', cta: 'Переглянути гостей', href: '/guests/' },
	{ title: 'Зросла частка прямих бронювань', text: '34% бронювань цього місяця були прямими проти 31% минулого місяця.', cta: 'Переглянути продажі', href: '/sales/' },
];

/* ---- AI inherits the user's scope (CRM.md → Shared operational definitions) ---- */
type Topic = 'guestBill' | 'hotelRevenue' | 'opsDetail' | 'prices';

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
	guestBill: /(не оплат|неоплач|оплат|борг|залиш|передоплат|поверн|нагадай)/,
	hotelRevenue: /(дохід|виторг|заробив|revenue|отримали|надходжен)/,
	opsDetail: /(прибир|кондиціонер|ремонт|техніч|не готов|непризначен|скарг|увагу)/,
	prices: /(ціна|₴|вартість)/,
};

function topicAllowed(topic: Topic, role: Role): boolean {
	switch (topic) {
		case 'guestBill':
			return can(role, 'guestBill');
		case 'hotelRevenue':
			return can(role, 'financeReports') || can(role, 'salesAnalytics');
		case 'opsDetail':
			return role !== 'sales' && role !== 'accountant';
		case 'prices':
			return role !== 'housekeeping' && role !== 'maintenance';
		default:
			return topic satisfies never;
	}
}

const TOPIC_DENIAL: Record<Topic, string> = {
	guestBill: 'У вашої ролі немає доступу до рахунків і оплат гостей.',
	hotelRevenue: 'У вашої ролі немає доступу до загальних фінансових показників готелю.',
	opsDetail: 'У вашої ролі немає доступу до деталей прибирання та ремонтів. Доступність номерів можна запитати окремо.',
	prices: 'У вашої ролі немає доступу до цін.',
};

function textAllowed(text: string, role: Role): boolean {
	const q = text.toLocaleLowerCase('uk-UA');
	return (Object.keys(TOPIC_PATTERNS) as Topic[]).every((t) => !TOPIC_PATTERNS[t].test(q) || topicAllowed(t, role));
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ');

function conversationText(c: Conversation): string {
	return [c.title, c.preview, ...c.messages.map((m) => m.text ?? stripHtml(m.html ?? ''))].join(' ');
}

function scopeDenial(q: string, role: Role): string | null {
	const topic = (Object.keys(TOPIC_PATTERNS) as Topic[]).find((t) => TOPIC_PATTERNS[t].test(q) && !topicAllowed(t, role));
	return topic ? TOPIC_DENIAL[topic] : null;
}

function itemCard(title: string, sub: string, extra?: string): string {
	return `<div class="ai-item-card"><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${extra ?? ''}</div>`;
}
function actionsHtml(actions: { label: string; href?: string; primary?: boolean; attrs?: string }[]): string {
	return `<div class="ai-actions">${actions
		.map((a) => (a.href ? `<a class="${a.primary ? 'primary' : ''}" href="${a.href}">${esc(a.label)}</a>` : `<button class="${a.primary ? 'primary' : ''}" ${a.attrs ?? ''}>${esc(a.label)}</button>`))
		.join('')}</div>`;
}
function sourceHtml(text: string): string {
	return `<div class="ai-source">${esc(text)}</div>`;
}

/* ---- seed conversations (chat history sidebar) ---- */
const SEED_CONVERSATIONS: Conversation[] = [
	{
		id: 'demo-room-56',
		title: 'На що звернути увагу зараз',
		preview: 'Перевірте номер 56 — там проблема, яку ще не оглянули.',
		time: '10:04',
		messages: [
			{ role: 'user', text: 'Підкажи, на що мені варто звернути увагу прямо зараз?' },
			{
				role: 'ai',
				html: `<p>Перевірте <b>номер 56</b> — гість повідомив про проблему з кондиціонером, і задачу ще не оглянули.</p>${actionsHtml([
					{ label: 'Відкрити прибирання', href: '/housekeeping/', primary: true },
				])}`,
				source: 'На основі відкритих скарг гостей та задач прибирання.',
				feedback: null,
			},
		],
	},
	{
		id: 'seed-unpaid',
		title: 'Хто не оплатив',
		preview: 'Олег Бондар · 1 200 ₴, Ірина Шевченко · 6 400 ₴',
		time: 'Вчора · 17:22',
		messages: [
			{ role: 'user', text: 'Хто ще не оплатив?' },
			{
				role: 'ai',
				html: `<p>Ще не оплатили:</p><div class="ai-cards">${KB.unpaidBookings.map((b) => itemCard(b.guest, `#${b.bookingId}`, `<b>${money(b.balance)}</b>`)).join('')}</div>${actionsHtml([
					{ label: 'Відкрити оплати', href: '/payments/', primary: true },
				])}`,
				source: 'На основі активних бронювань з неоплаченим залишком.',
				feedback: null,
			},
		],
	},
	{
		id: 'seed-weekend',
		title: 'Вільні номери на вихідні',
		preview: '103 · Стандарт, 205 · Люкс, 301 · Апартаменти',
		time: '15 вересня · 14:40',
		messages: [
			{ role: 'user', text: 'Які номери вільні на вихідні?' },
			{
				role: 'ai',
				html: `<p>На 20–23 вересня доступні:</p><div class="ai-cards">${KB.freeWeekend.map((r) => itemCard(r.number + ' · ' + r.type, money(r.price) + ' / ніч')).join('')}</div>${actionsHtml([
					{ label: 'Відкрити календар', href: '/calendar/' },
					{ label: 'Створити бронювання', href: '/new-booking/', primary: true },
				])}`,
				feedback: null,
			},
		],
	},
];

/* ---- answer engine ---- */
function answer(qRaw: string, role: Role): AiAnswer | null {
	const q = qRaw.toLocaleLowerCase('uk-UA');

	const denied = scopeDenial(q, role);
	if (denied) return { html: `<div class="perm-note">${denied}</div>`, noFeedback: true };

	if (/олександр/.test(q) && !/коваленко|бондар|петренко/.test(q)) {
		const names = KB.ambiguous['олександр'];
		return { html: `<p>Знайдено ${names.length} гостей з ім'ям Олександр.</p><div class="ai-cards">${names.map((n) => itemCard(n, 'Клікніть, щоб уточнити')).join('')}</div><p style="margin-top:10px">Кого ви маєте на увазі?</p>` };
	}
	if (/spa|спа/.test(q)) {
		return { html: `<p>У Hotel Upwork недостатньо даних, щоб це визначити.</p><p>У профілях гостей зараз не зберігається інформація про використання SPA.</p>` };
	}

	if (/скасу.*(анн|1842)/.test(q)) {
		const g = KB.guests['анна коваленко'];
		return {
			html: `<p>Знайдено:</p><div class="ai-cards">${itemCard(g.name, `Booking #${g.bookingId} · ${g.dates} · ${g.room}`, `<b>${money(g.paid)}</b>`)}</div>${actionsHtml([{ label: 'Перейти до скасування', href: '/booking/', primary: true }])}<p class="form-note" style="margin-top:8px">AI не скасовує бронювання напряму, потрібне підтвердження на сторінці бронювання.</p>`,
			source: 'На основі даних бронювання #1842.',
		};
	}
	if (/нагадай.*(олег|1847|1 ?200)/.test(q)) {
		return {
			html: `<p>Знайдено активне бронювання Олега Бондаря #1847.</p><p>Залишок: <b>${money(1200)}</b></p><p>Пропоноване повідомлення:</p><p style="background:#f7f7f8;border-radius:8px;padding:10px 12px">Вітаємо, Олеже!<br>Нагадуємо, що за вашим бронюванням залишилось оплатити 1 200 ₴.</p>${actionsHtml([{ label: 'Перейти до повідомлення', href: '/messages/', primary: true }, { label: 'Скасувати', attrs: 'data-noop' }])}`,
		};
	}
	if (/забронюй.*анн|заброн.*люкс/.test(q)) {
		return {
			html: `<p>Знайдено гостя: <b>Анна Коваленко</b></p><p>На 20–23 вересня доступні:</p>${actionsHtml([{ label: '204 · Люкс, 4 800 ₴', attrs: 'data-flow-room="204"' }, { label: '205 · Люкс, 5 400 ₴', attrs: 'data-flow-room="205"' }])}`,
		};
	}
	if (/напиши гост.*готов.*14:00|номер буде готов/.test(q)) {
		return {
			html: `<p>Пропонований текст:</p><p style="background:#f7f7f8;border-radius:8px;padding:10px 12px">Вітаємо, Анно!<br>Ваш номер буде готовий до заселення після 14:00.<br>Якщо ваш час прибуття зміниться, можете написати нам у відповідь.</p>${actionsHtml([{ label: 'Використати повідомлення', href: '/messages/', primary: true }, { label: 'Змінити текст', attrs: 'data-noop' }])}`,
		};
	}

	if (/сьогодні важлив|що сьогодні|огляд дня/.test(q)) {
		return {
			html: `<p>Сьогодні у вас <b>${KB.arrivals.length} заїзди</b> і <b>${KB.departures} виїзди</b>.</p><p><b>${KB.occupied} з ${KB.totalRooms}</b> номерів зайняті.</p><p><b>${KB.needsCleaning} номери</b> потребують прибирання.</p><p>За бронюваннями очікується <b>${money(KB.unpaidTotal)}</b> оплати.</p><p>Перше заселення о <b>13:30</b>. Номер 204 потрібно підготувати до цього часу.</p>${actionsHtml([{ label: 'Заїзди', href: '/calendar/' }, { label: 'Прибирання', href: '/housekeeping/' }, { label: 'Оплати', href: '/payments/' }])}`,
			source: 'На основі поточних даних Calendar, Housekeeping та Payments.',
		};
	}
	if (/хто.*заїжджа(є|ють).*сьогодні|заїзди сьогодні/.test(q)) {
		return {
			html: `<p>Сьогодні очікується <b>${KB.arrivals.length} заїзди</b>.</p><div class="ai-cards">${KB.arrivals.map((a) => itemCard(a.time + ': ' + a.guest, a.room + ' · ' + a.payment)).join('')}</div>${actionsHtml([{ label: 'Відкрити всі заїзди', href: '/calendar/', primary: true }])}`,
			source: `На основі ${KB.arrivals.length} бронювань на сьогодні.`,
		};
	}
	if (/виїжджа(є|ють).*сьогодні|виїзди сьогодні/.test(q)) {
		return { html: `<p>Сьогодні очікується <b>${KB.departures} виїзди</b>.</p>${actionsHtml([{ label: 'Відкрити календар', href: '/calendar/' }])}` };
	}
	if (/завтра.*бронюван|бронювань на завтра/.test(q)) {
		return { html: `<p>На завтра заплановано <b>${KB.tomorrowBookings} бронювання</b>.</p>${actionsHtml([{ label: 'Відкрити календар', href: '/calendar/' }])}` };
	}
	if (/не підтвердж/.test(q)) {
		return { html: `<p>Непідтверджені бронювання:</p><div class="ai-cards">${KB.unconfirmed.map((b) => itemCard(b.guest, `#${b.bookingId} · ${b.dates}`)).join('')}</div>${actionsHtml([{ label: 'Відкрити бронювання', href: '/booking/' }])}` };
	}
	if (/цього тижня.*заїжджа|заїзди.*тиждень/.test(q)) {
		return { html: `<p>Цього тижня очікується <b>${KB.weekBookings} заїздів</b>.</p>${actionsHtml([{ label: 'Відкрити календар', href: '/calendar/' }])}` };
	}
	if (/скасован.*цього місяця|скасован.*бронюван/.test(q)) {
		return { html: `<p>Скасовані бронювання цього місяця:</p><div class="ai-cards">${KB.cancelledThisMonth.map((b) => itemCard(b.guest, `#${b.bookingId} · ${b.reason}`)).join('')}</div>` };
	}
	if (/бронюван.*анн|покажи.*коваленко/.test(q)) {
		const g = KB.guests['анна коваленко'];
		return { html: `<div class="ai-cards">${itemCard(g.name, `#${g.bookingId} · ${g.dates} · ${g.room}`, `<b>${money(g.total)}</b>`)}</div>${actionsHtml([{ label: 'Відкрити бронювання', href: '/booking/', primary: true }])}` };
	}
	if (/вільні.*(з \d|по \d|20.*23)/.test(q) || /номери вільні.*вересня/.test(q)) {
		return {
			html: `<p>На 20–23 вересня доступні:</p><div class="ai-cards">${KB.freeWeekend.map((r) => itemCard(r.number + ' · ' + r.type, money(r.price) + ' / ніч')).join('')}</div>${actionsHtml([{ label: 'Відкрити календар', href: '/calendar/' }, { label: 'Створити бронювання', href: '/new-booking/', primary: true }])}`,
		};
	}

	if (/постійн.*гост|повторн.*гост.*хто/.test(q)) {
		return { html: `<p>Постійні гості мають мінімум 2 завершених проживання. Наприклад: <b>Марія Петренко</b> (8 проживань), <b>Анна Коваленко</b> (4 проживання).</p>${actionsHtml([{ label: 'Переглянути гостей', href: '/guests/', primary: true }])}` };
	}
	if (/найбільше разів|найчастіше повертається/.test(q)) {
		return { html: `<p><b>${KB.mostStays.name}</b> проживала у вас найбільше разів, ${KB.mostStays.stays}.</p>${actionsHtml([{ label: 'Відкрити профіль', href: '/guest/' }])}` };
	}
	if (/більше трьох разів/.test(q)) {
		return { html: `<p><b>Марія Петренко</b> (8) та <b>Анна Коваленко</b> (4) поверталися більше трьох разів.</p>` };
	}
	if (/давно не був/.test(q)) {
		return { html: `<p><b>${KB.longTimeGone} постійних гостей</b> мають мінімум 2 проживання і не були у вас понад 6 місяців.</p>${actionsHtml([{ label: 'Переглянути гостей', href: '/guests/', primary: true }])}` };
	}
	if (/нових гостей цього місяця|скільки нових/.test(q)) {
		return { html: `<p>Цього місяця <b>${KB.newGuestsThisMonth} нових гостей</b>.</p>` };
	}
	if (/що ми знаємо про|про анну|про олега|про марію/.test(q)) {
		const name = /олег/.test(q) ? 'олег бондар' : /марі/.test(q) ? 'марія петренко' : 'анна коваленко';
		const g = KB.guests[name];
		return {
			html: `<p><b>${g.name}</b>${g.tag ? ' · ' + g.tag : ''}</p><p>${g.stays} проживання. Улюблений тип номера: ${g.favType}. Останній візит: ${g.lastVisit}.</p>${g.pref ? `<p>Побажання: ${g.pref}.</p>` : ''}${actionsHtml([{ label: 'Відкрити профіль', href: '/guest/', primary: true }])}`,
			source: 'На основі профілю гостя та історії проживань.',
		};
	}
	if (/побажанн.*гост/.test(q)) {
		return { html: `<p>Анна Коваленко: тихий номер, пізній check-in.</p>` };
	}

	if (/хто.*не оплат|не оплативши/.test(q)) {
		return {
			html: `<p>Ще не оплатили:</p><div class="ai-cards">${KB.unpaidBookings.map((b) => itemCard(b.guest, `#${b.bookingId}`, `<b>${money(b.balance)}</b>`)).join('')}</div>${actionsHtml([{ label: 'Відкрити оплати', href: '/payments/', primary: true }])}`,
			source: 'На основі активних бронювань з неоплаченим залишком.',
		};
	}
	if (/скільки.*отримали сьогодні|дохід сьогодні/.test(q)) {
		return { html: `<p>Сьогодні отримано <b>${money(KB.receivedToday)}</b>.</p>${actionsHtml([{ label: 'Відкрити оплати', href: '/payments/' }])}` };
	}
	if (/очікується оплат|скільки очікується/.test(q)) {
		return { html: `<p>Очікується оплат на суму <b>${money(KB.unpaidTotal + 12400)}</b> за поточними бронюваннями.</p>` };
	}
	if (/заїжджа.*сьогодні.*борг|борг.*сьогодні/.test(q)) {
		return { html: `<p>Сьогодні із заборгованістю заїжджає <b>Олег Бондар</b>, залишок ${money(1200)}.</p>${actionsHtml([{ label: 'Відкрити бронювання', href: '/booking/' }])}` };
	}
	if (/передоплат.*цього місяця|скільки передоплат/.test(q)) {
		return { html: `<p>Цього місяця отримано передоплат на суму <b>${money(KB.depositsThisMonth)}</b>.</p>` };
	}
	if (/повернення|повернуто/.test(q)) {
		return { html: `<p>Повернення цього місяця:</p><div class="ai-cards">${KB.refunds.map((r) => itemCard(r.guest, `#${r.bookingId}`, `<b>${money(r.amount)}</b>`)).join('')}</div>` };
	}
	if (/найбільший.*залишок|найбільший борг/.test(q)) {
		return { html: `<p>Найбільший неоплачений залишок: <b>${KB.biggestBalance.guest}</b> · #${KB.biggestBalance.bookingId} · ${money(KB.biggestBalance.balance)}.</p>${actionsHtml([{ label: 'Відкрити бронювання', href: '/booking/' }])}` };
	}

	if (/номери зараз вільн|які номери вільн/.test(q)) {
		return { html: `<p>Зараз вільні:</p><div class="ai-cards">${KB.freeNow.map((r) => itemCard(r.number + ' · ' + r.type, 'Готовий')).join('')}</div>${actionsHtml([{ label: 'Відкрити номери', href: '/rooms/' }])}` };
	}
	if (/номери зайнят/.test(q)) {
		return { html: `<p><b>${KB.occupied} з ${KB.totalRooms}</b> номерів зараз зайняті.</p>${actionsHtml([{ label: 'Відкрити номери', href: '/rooms/' }])}` };
	}
	if (/статус номера 204|номер 204/.test(q)) {
		return { html: `<p>Номер 204: <b>${KB.roomStatus['204']}</b>.</p>${actionsHtml([{ label: 'Відкрити номер', href: '/rooms/' }])}` };
	}
	if (/звільниться номер 205|коли.*205/.test(q)) {
		return { html: `<p>Номер 205 вже вільний і готовий.</p>` };
	}
	if (/заблоковані.*ремонт|номери.*заблоковані/.test(q)) {
		return { html: `<div class="ai-cards">${KB.blockedRooms.map((r) => itemCard(r.number, `${r.reason} · ${r.period}`)).join('')}</div>${actionsHtml([{ label: 'Відкрити номери', href: '/rooms/' }])}` };
	}

	if (/потрібно прибрати|що ще прибрати/.test(q)) {
		return { html: `<p>Потрібно прибрати:</p><div class="ai-cards">${KB.cleaning.needs.map((r) => itemCard('Номер ' + r.number, r.arrival ? 'Заїзд о ' + r.arrival : '')).join('')}</div>${actionsHtml([{ label: 'Відкрити прибирання', href: '/housekeeping/', primary: true }])}` };
	}
	if (/найтерміновіший|найважливіший номер/.test(q)) {
		return { html: `<p>Найтерміновіший: <b>номер 204</b>: заїзд о 13:30, ще не готовий.</p>${actionsHtml([{ label: 'Відкрити прибирання', href: '/housekeeping/' }])}` };
	}
	if (/хто прибирає 204|прибирає.*204/.test(q)) {
		return { html: `<p>Номер 204 ще не призначено на прибирання.</p>${actionsHtml([{ label: 'Призначити', href: '/housekeeping/' }])}` };
	}
	if (/заїзд у найближчі 2 години|найближчі 2 години/.test(q)) {
		return { html: `<p>У найближчі 2 години заїжджає гість у номер <b>204</b> (13:30).</p>` };
	}
	if (/непризначені задачі/.test(q)) {
		return { html: `<p>Так, <b>${KB.unassignedTasks} непризначені задачі</b> з прибирання.</p>${actionsHtml([{ label: 'Відкрити прибирання', href: '/housekeeping/' }])}` };
	}
	if (/номери вже готові|готові номери/.test(q)) {
		return { html: `<p>Готові: ${KB.cleaning.ready.join(', ')}.</p>` };
	}

	if (/найбільше бронювань.*звідки|звідки.*найбільше/.test(q)) {
		return { html: `<p><b>${KB.sales.topSource}</b> дає найбільше бронювань, ${KB.sales.topCount}.</p>${actionsHtml([{ label: 'Переглянути продажі', href: '/sales/', primary: true }])}` };
	}
	if (/дохід цього місяця|скільки.*отримали цього місяця/.test(q)) {
		return { html: `<p>Дохід цього місяця: <b>${money(KB.sales.revenueMonth)}</b>.</p>`, source: 'На основі 86 бронювань за 1–30 вересня.' };
	}
	if (/instagram/.test(q)) {
		return { html: `<p>Instagram приніс <b>${KB.sales.instagram.count} бронювань</b> на <b>${money(KB.sales.instagram.revenue)}</b>.</p>${actionsHtml([{ label: 'Переглянути продажі', href: '/sales/' }])}` };
	}
	if (/частка прямих/.test(q)) {
		return { html: `<p>Частка прямих бронювань: <b>${KB.sales.directShare}%</b> (було ${KB.sales.directSharePrev}% минулого місяця).</p>` };
	}
	if (/повторних гостей|скільки повторних/.test(q)) {
		return { html: `<p>Повторних гостей цього місяця: <b>${KB.sales.returning}</b>.</p>` };
	}
	if (/змінилися продажі|порівняно з минулим місяцем/.test(q)) {
		return { html: `<p>Прямі бронювання: ${KB.sales.directSharePrev}% → ${KB.sales.directShare}%. Дохід зростає порівняно з минулим місяцем.</p>${actionsHtml([{ label: 'Переглянути продажі', href: '/sales/' }])}` };
	}

	return null;
}

function fallbackAnswer(role: Role): AiAnswer {
	const hints = SUGGESTIONS.filter((s) => textAllowed(s, role)).slice(0, 3);
	return { html: `<p>Не знайшов точної відповіді на це запитання. Спробуйте одне з підказаних або перефразуйте.</p><div class="ai-cards">${hints.map((s) => itemCard(s, 'Натисніть, щоб запитати')).join('')}</div>` };
}

@Component({
	selector: 'app-ai',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './ai.component.html',
	styleUrl: './ai.component.scss',
})
export class AiComponent {
	protected readonly money = money;
	protected readonly KB = KB;
	protected readonly ROLE_LABEL = ROLE_LABEL;

	protected readonly role = signal<Role>(getDemoRole() ?? 'owner');
	protected readonly SUGGESTIONS = SUGGESTIONS.filter((s) => textAllowed(s, this.role()));
	protected readonly showBrief = topicAllowed('guestBill', this.role()) && topicAllowed('opsDetail', this.role());
	protected readonly INSIGHTS = INSIGHTS.filter(
		(i) => isPageAllowed(this.role(), i.href.replace(/\//g, '')) && textAllowed(i.title + ' ' + i.text, this.role()),
	);
	protected readonly conversations = signal<Conversation[]>(
		SEED_CONVERSATIONS.filter((c) => textAllowed(conversationText(c), this.role())).map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m })) })),
	);
	protected readonly activeId = signal<string>(this.conversations()[0]?.id ?? 'new-' + Date.now());
	protected readonly composerText = signal('');
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly talksOpen = signal(false);

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
	protected readonly composerRef = viewChild<ElementRef<HTMLTextAreaElement>>('composerEl');
	protected readonly chatScrollRef = viewChild<ElementRef<HTMLDivElement>>('chatScrollEl');

	protected readonly activeConversation = computed(() => this.conversations().find((c) => c.id === this.activeId()));
	protected readonly messages = computed(() => this.activeConversation()?.messages ?? []);
	protected readonly hasMessages = computed(() => this.messages().length > 0);

	private _toastTimer?: ReturnType<typeof setTimeout>;
	private _answerTimer?: ReturnType<typeof setTimeout>;

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
			this.messages();
			queueMicrotask(() => {
				const el = this.chatScrollRef()?.nativeElement;
				if (el) el.scrollTop = el.scrollHeight;
			});
		});
	}

	protected onRoleChange(value: string): void {
		this.role.set(value as Role);
		this.toast('Роль (демо): ' + ROLE_LABEL[value as Role]);
	}

	protected onComposerInput(event: Event): void {
		const el = event.target as HTMLTextAreaElement;
		this.composerText.set(el.value);
		el.style.height = 'auto';
		el.style.height = Math.min(120, el.scrollHeight) + 'px';
	}

	protected onComposerKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			this.sendComposer();
		}
	}

	protected sendComposer(): void {
		const text = this.composerText().trim();
		if (!text) return;
		this.handleQuery(text);
		this.composerText.set('');
		const el = this.composerRef()?.nativeElement;
		if (el) el.style.height = 'auto';
	}

	protected askSuggestion(text: string): void {
		this.handleQuery(text);
	}

	private updateActiveMessages(fn: (msgs: ChatMessage[]) => ChatMessage[]): void {
		const id = this.activeId();
		this.conversations.update((cs) => cs.map((c) => (c.id === id ? { ...c, messages: fn(c.messages) } : c)));
	}

	protected handleQuery(text: string): void {
		if (!this.conversations().some((c) => c.id === this.activeId())) {
			const id = this.activeId();
			this.conversations.update((cs) => [{ id, title: text.length > 42 ? text.slice(0, 42) + '…' : text, preview: '', time: 'Щойно', messages: [] }, ...cs]);
		}
		this.updateActiveMessages((msgs) => [...msgs, { role: 'user', text }]);
		const loadingText = /номер|вільн/i.test(text) ? 'Шукаю доступні номери...' : 'Перевіряю бронювання та дані готелю...';
		this.updateActiveMessages((msgs) => [...msgs, { role: 'ai', html: `<span>${loadingText}</span>`, noFeedback: true, loading: true }]);
		const id = this.activeId();
		const loadingIndex = this.messages().length - 1;
		clearTimeout(this._answerTimer);
		this._answerTimer = setTimeout(() => {
			let res = answer(text, this.role()) ?? fallbackAnswer(this.role());
			if (!res.noFeedback && !textAllowed(stripHtml(res.html) + ' ' + (res.source ?? ''), this.role())) {
				res = { html: `<div class="perm-note">Відповідь містить дані поза межами вашої ролі. Уточніть запит у межах вашої роботи.</div>`, noFeedback: true };
			}
			this.conversations.update((cs) =>
				cs.map((c) =>
					c.id === id
						? {
								...c,
								preview: res.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 90),
								messages: c.messages.map((m, i) => (i === loadingIndex ? { role: 'ai', html: res.html, source: res.source, noFeedback: !!res.noFeedback, feedback: null } : m)),
							}
						: c,
				),
			);
		}, 500);
	}

	protected selectConversation(id: string): void {
		this.activeId.set(id);
		this.talksOpen.set(false);
	}

	protected newChat(): void {
		this.activeId.set('new-' + Date.now());
		this.talksOpen.set(false);
	}

	protected toggleTalks(): void {
		this.talksOpen.update((v) => !v);
	}

	protected closeTalks(): void {
		this.talksOpen.set(false);
	}

	protected clearChat(): void {
		this.updateActiveMessages(() => []);
		this.toast('Чат очищено');
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected openUnderDevelopment(): void {
		this.dialogView.set({ kind: 'section' });
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	protected onMessageAreaClick(event: MouseEvent, index: number): void {
		const target = event.target as HTMLElement;
		const el = target.closest('button,a') as HTMLElement | null;
		if (!el) return;

		if (el.dataset['goto']) {
			window.location.href = el.dataset['goto']!;
			return;
		}
		if (el.dataset['flowRoom']) {
			event.preventDefault();
			const room = el.dataset['flowRoom']!;
			const price = room === '204' ? 4800 : 5400;
			this.updateActiveMessages((msgs) => [
				...msgs,
				{
					role: 'ai',
					html: `<p>Обрано номер ${room} · Люкс.</p><p><b>Анна Коваленко</b><br>Номер: ${room} · Люкс<br>Дати: 20–23 вересня<br>Сума: ${money(price)}</p>${actionsHtml([{ label: 'Відкрити форму бронювання', href: '/new-booking/', primary: true }])}`,
					feedback: null,
				},
			]);
			return;
		}
		if (el.dataset['noop'] !== undefined) {
			event.preventDefault();
			this.toast('Дію скасовано');
			return;
		}
	}

	protected giveFeedback(index: number, kind: 'up' | 'down'): void {
		this.updateActiveMessages((msgs) => msgs.map((m, i) => (i === index ? { ...m, feedback: kind } : m)));
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
