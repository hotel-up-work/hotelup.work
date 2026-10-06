import type { Role } from './role';

export type Plan = 'start' | 'pro' | 'enterprise';

export const PLAN_ORDER: Plan[] = ['start', 'pro', 'enterprise'];

export interface PlanInfo {
	key: Plan;
	name: string;
	price: string;
	period: string;
	/** Yearly price line, e.g. "7 999 грн / рік"; empty for the free plan. */
	yearly: string;
	tagline: string;
	limits: string;
	/** Short "what you get" list for plan cards. */
	highlights: string[];
	cta: string;
	recommended?: boolean;
}

export const PLANS: Record<Plan, PlanInfo> = {
	start: {
		key: 'start',
		name: 'Start',
		price: '0 грн',
		yearly: '',
		period: 'назавжди',
		tagline: 'Календар і заявки з ваших сайтів.',
		limits: 'До 10 номерів · до 3 працівників',
		highlights: ['Календар бронювань', 'Заявки з сайтів через API', 'Команда та ролі', 'Налаштування готелю'],
		cta: 'Почати безкоштовно',
	},
	pro: {
		key: 'pro',
		name: 'Pro',
		price: '799 грн',
		yearly: '7 999 грн / рік',
		period: '/ місяць',
		tagline: 'Щоденна робота всього готелю.',
		limits: 'До 30 номерів · до 15 працівників',
		highlights: ['Усе зі Start', 'Огляд дня та CRM гостей', 'Номери, оплати, прибирання', 'Повідомлення гостям', 'Усі 7 ролей'],
		cta: 'Спробувати Pro',
		recommended: true,
	},
	enterprise: {
		key: 'enterprise',
		name: 'Enterprise',
		price: 'від 1 299 грн',
		yearly: 'від 12 999 грн / рік',
		period: '/ місяць',
		tagline: 'Автоматизації, аналітика та AI.',
		limits: 'Без обмежень номерів і працівників',
		highlights: ['Усе з Pro', 'Автоматизації повідомлень', 'Аналітика продажів і каналів', 'AI-помічник', 'Кілька готелів, пріоритетна підтримка'],
		cta: 'Спробувати Enterprise',
	},
};

/** Pages each plan unlocks, cumulative. Route paths as declared in app.routes.ts. */
const PLAN_ADDS: Record<Plan, string[]> = {
	start: ['calendar', 'submissions', 'rooms', 'team', 'settings'],
	pro: ['dashboard', 'guests', 'payments', 'housekeeping', 'messages'],
	enterprise: ['automations', 'sales', 'ai'],
};

export const PLAN_PAGES: Record<Plan, string[]> = {
	start: PLAN_ADDS.start,
	pro: [...PLAN_ADDS.start, ...PLAN_ADDS.pro],
	enterprise: [...PLAN_ADDS.start, ...PLAN_ADDS.pro, ...PLAN_ADDS.enterprise],
};

/** Room cap per plan (CRM.md → Plans: "Start — up to 10 rooms", "Pro — up to 30"), null = unlimited. */
export const PLAN_ROOM_LIMIT: Record<Plan, number | null> = {
	start: 10,
	pro: 30,
	enterprise: null,
};

/** Staff account cap per plan (CRM.md → Plans: "Start — 3 staff accounts", "Pro — 15"), null = unlimited. */
export const PLAN_STAFF_LIMIT: Record<Plan, number | null> = {
	start: 3,
	pro: 15,
	enterprise: null,
};

/** Demo room inventory trimmed to the stored plan's room cap. */
export function limitRoomsToPlan<T>(rooms: T[]): T[] {
	const limit = PLAN_ROOM_LIMIT[getStoredPlan()];
	return limit === null ? rooms : rooms.slice(0, limit);
}

/** Roles that can be used on each plan (CRM.md → Plans). */
export const PLAN_ROLES: Record<Plan, Role[]> = {
	start: ['owner', 'manager', 'reception', 'sales'],
	pro: ['owner', 'manager', 'reception', 'housekeeping', 'sales', 'accountant', 'maintenance'],
	enterprise: ['owner', 'manager', 'reception', 'housekeeping', 'sales', 'accountant', 'maintenance'],
};

export function planIncludes(plan: Plan, path: string): boolean {
	return PLAN_PAGES[plan].includes(path);
}

/** Cheapest plan that includes the page, or null for pages outside the plan model. */
export function planForPage(path: string): Plan | null {
	return PLAN_ORDER.find((plan) => planIncludes(plan, path)) ?? null;
}

const PLAN_KEY = 'hotelup_plan';
const DEFAULT_PLAN: Plan = 'enterprise';

export function getStoredPlan(): Plan {
	try {
		const stored = localStorage.getItem(PLAN_KEY);
		return stored && stored in PLANS ? (stored as Plan) : DEFAULT_PLAN;
	} catch {
		return DEFAULT_PLAN;
	}
}

export function setStoredPlan(plan: Plan): void {
	try {
		localStorage.setItem(PLAN_KEY, plan);
	} catch {
		/* ignore storage errors (private mode, etc.) */
	}
}
