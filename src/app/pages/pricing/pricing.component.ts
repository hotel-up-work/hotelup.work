import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { companyEmailHref } from '../../feature/company/company.data';
import { sendSalesRequest } from '../../shared/sales-contact';
import { PLAN_ORDER, planIncludes, PLANS, setStoredPlan, type Plan } from '../../shared/plan';

interface CompareRow {
	label: string;
	hint?: string;
	/** Page key: the cell is derived from PLAN_PAGES. */
	page?: string;
	/** Fixed values per plan, for limits that are not pages. */
	values?: Record<Plan, string>;
}

interface CompareGroup {
	title: string;
	rows: CompareRow[];
}

const COMPARE: CompareGroup[] = [
	{
		title: 'Безкоштовно для всіх',
		rows: [
			{ label: 'Календар бронювань', hint: 'Номери × дати, перенесення та продовження', page: 'calendar' },
			{ label: 'Заявки з сайтів', hint: 'Форми з ваших сайтів через API', page: 'submissions' },
			{ label: 'Команда та ролі', page: 'team' },
			{ label: 'Налаштування готелю', page: 'settings' },
		],
	},
	{
		title: 'Щоденна робота',
		rows: [
			{ label: 'Огляд дня', hint: 'Заїзди, виїзди, завантаження, що потребує уваги', page: 'dashboard' },
			{ label: 'CRM гостей', page: 'guests' },
			{ label: 'Номери та ціни', page: 'rooms' },
			{ label: 'Оплати та залишки', page: 'payments' },
			{ label: 'Прибирання', page: 'housekeeping' },
			{ label: 'Повідомлення гостям', hint: 'Email, SMS, Telegram в одному вікні', page: 'messages' },
		],
	},
	{
		title: 'Зростання',
		rows: [
			{ label: 'Автоматизації', hint: 'Повідомлення гостям за подіями бронювання', page: 'automations' },
			{ label: 'Аналітика продажів', hint: 'Канали, кампанії, пряме vs OTA', page: 'sales' },
			{ label: 'AI-помічник', page: 'ai' },
		],
	},
	{
		title: 'Ліміти',
		rows: [
			{ label: 'Номерів', values: { start: 'до 10', pro: 'до 30', enterprise: 'без обмежень' } },
			{ label: 'Працівників', values: { start: 'до 3', pro: 'до 15', enterprise: 'без обмежень' } },
			{
				label: 'Ролі',
				values: { start: 'Власник, Менеджер, Рецепція, Продажі', pro: 'усі 7', enterprise: 'усі 7' },
			},
			{ label: 'Готелів в акаунті', values: { start: '1', pro: '1', enterprise: 'кілька' } },
			{ label: 'Підтримка', values: { start: 'email', pro: 'email і чат', enterprise: 'пріоритетна' } },
		],
	},
];

interface SiteTier {
	name: string;
	price: string;
	tagline: string;
	/** Name of the previous tier this one builds on; renders as the first line of the list. */
	inherits?: string;
	features: string[];
	recommended?: boolean;
}

const SITE_TIERS: SiteTier[] = [
	{
		name: 'Базовий',
		price: '$200',
		tagline: 'Швидкий старт: сайт на готовому дизайні',
		features: [
			'Готовий дизайн',
			'Ваші фото та тексти',
			'SEO-налаштування сайту',
			'Мобільна версія',
			'Система бронювання: заявки надходять у Hotel Upwork',
		],
	},
	{
		name: 'Про',
		price: '$500',
		tagline: 'Сайт у стилістиці вашого готелю',
		inherits: 'Базовий',
		recommended: true,
		features: [
			'Редизайн під вашу стилістику',
			'Індивідуальні сторінки',
			'Додаткові сторінки',
			'Бронювання на сайті з доступністю номерів та оплатою',
		],
	},
	{
		name: 'Розширений',
		price: '$900',
		tagline: 'Сайт, яким керуєте самі',
		inherits: 'Про',
		features: [
			'Мультимовність',
			'Динамічне створення сторінок',
			'Блог (статті)',
			'Керування галереєю та номерами',
		],
	},
	{
		name: 'Магазин',
		price: '$1500',
		tagline: 'Сайт плюс власний інтернет-магазин',
		inherits: 'Розширений',
		features: [
			'Маркетплейс (магазин) з товарами',
			'Облік продукції',
			'Система оплат з інтеграцією Нової пошти',
		],
	},
];

const FAQ: { q: string; a: string }[] = [
	{
		q: 'Ціна сайту разова чи щомісячна?',
		a: 'Сайт оплачується один раз. CRM і заявки з сайту працюють за окремими тарифами нижче, а Start безкоштовний.',
	},
	{
		q: 'Чи можна перейти на вищий пакет пізніше?',
		a: 'Так. Ви доплачуєте різницю між пакетами, а вже зроблене лишається вашим.',
	},
	{
		q: 'Start справді безкоштовний?',
		a: 'Так, без обмеження в часі і без картки. Ліміт: до 10 номерів і до 3 працівників. Коли готель виросте, перейдіть на Pro.',
	},
	{
		q: 'Як заявки з мого сайту потрапляють у Hotel Upwork?',
		a: 'Сайт залишається окремим проєктом. Його форми надсилають дані через API Hotel Upwork: адресу та ключ ви знайдете в розділі «Заявки» → «Підключити сайт». Передайте їх розробнику сайту.',
	},
	{
		q: 'Що станеться з даними, якщо я зміню тариф?',
		a: 'Нічого не видаляється. Розділи, яких немає в новому тарифі, стають недоступними, а їхні дані повертаються, щойно ви знову ввімкнете тариф.',
	},
	{
		q: 'Можна купити систему одним платежем?',
		a: 'Так, для мереж і готелів, яким не підходить підписка, обговорюємо викуп індивідуально. Напишіть нам, і ми підготуємо пропозицію.',
	},
];

@Component({
	selector: 'app-pricing',
	imports: [RouterLink, FormsModule],
	templateUrl: './pricing.component.html',
	styleUrl: './pricing.component.scss',
})
export class PricingComponent {
	private readonly _router = inject(Router);

	protected readonly interests = [
		...SITE_TIERS.map((t) => `Сайт: ${t.name} (${t.price})`),
		...PLAN_ORDER.map((key) => `CRM: ${PLANS[key].name}`),
		'Інше',
	];
	protected readonly form = { name: '', phone: '', email: '', hotel: '', interest: this.interests[1], message: '' };
	protected readonly status = signal<'idle' | 'sending' | 'sent' | 'error'>('idle');
	protected readonly siteTiers = SITE_TIERS;
	protected readonly siteOrderHref = companyEmailHref
		? `${companyEmailHref}?subject=${encodeURIComponent('Замовлення сайту для готелю')}`
		: '/demo';
	protected readonly plans = PLAN_ORDER.map((key) => PLANS[key]);
	protected readonly compare = COMPARE;
	protected readonly faq = FAQ;

	protected cell(row: CompareRow, plan: Plan): string {
		if (row.values) return row.values[plan];
		return row.page && planIncludes(plan, row.page) ? '✓' : '';
	}

	protected async submit(): Promise<void> {
		if (this.status() === 'sending') return;
		this.status.set('sending');
		try {
			this.status.set((await sendSalesRequest({ ...this.form })) ? 'sent' : 'error');
		} catch {
			this.status.set('error');
		}
	}

	protected choose(plan: Plan): void {
		setStoredPlan(plan);
		this._router.navigateByUrl('/demo');
	}
}
