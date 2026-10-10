import { getStoredPlan, planIncludes, type Plan } from './plan';

export type Role = 'reception' | 'manager' | 'housekeeping' | 'owner' | 'sales' | 'accountant' | 'maintenance';

export const ROLE_LABEL: Record<Role, string> = {
	owner: 'Власник',
	manager: 'Менеджер',
	reception: 'Рецепція',
	housekeeping: 'Прибирання',
	sales: 'Продажі / Маркетинг',
	accountant: 'Бухгалтер',
	maintenance: 'Технічне обслуговування',
};

/** Route paths (as declared in app.routes.ts, without the leading slash) each role may open. `ai` is available to everyone. */
export const ROLE_PAGES: Record<Role, string[]> = {
	owner: ['dashboard', 'calendar', 'submissions', 'guests', 'rooms', 'payments', 'housekeeping', 'messages', 'automations', 'sales', 'ai', 'team', 'settings'],
	manager: ['dashboard', 'calendar', 'submissions', 'guests', 'rooms', 'payments', 'housekeeping', 'messages', 'automations', 'sales', 'ai', 'team', 'settings'],
	reception: ['dashboard', 'calendar', 'submissions', 'guests', 'rooms', 'payments', 'messages', 'ai'],
	housekeeping: ['housekeeping', 'ai'],
	sales: ['calendar', 'submissions', 'sales', 'ai'],
	accountant: ['payments', 'ai'],
	maintenance: ['rooms', 'housekeeping', 'ai'],
};

/** Explicit home screen per role (CRM.md → People, roles and home screens). Used by login and denied-route fallback. */
export const ROLE_HOME: Record<Role, string> = {
	owner: 'dashboard',
	manager: 'dashboard',
	reception: 'dashboard',
	housekeeping: 'housekeeping',
	sales: 'sales',
	accountant: 'payments',
	maintenance: 'rooms',
};

export const PAGE_LABEL: Record<string, string> = {
	dashboard: 'Огляд',
	calendar: 'Календар',
	submissions: 'Заявки',
	guests: 'Гості',
	rooms: 'Номери',
	payments: 'Оплати',
	housekeeping: 'Прибирання',
	messages: 'Повідомлення',
	automations: 'Автоматизації',
	sales: 'Продажі',
	ai: 'AI-помічник',
	team: 'Команда',
	settings: 'Налаштування',
};

/**
 * Pages backed by real data (CRM.md → Live pages). A signed-in Firebase account sees only these;
 * every other page stays demo-only until it is wired to Firestore. Add a path here when it goes live.
 */
export const LIVE_PAGES: string[] = ['dashboard', 'submissions', 'calendar', 'new-booking', 'booking', 'guests', 'payments', 'settings'];

/** True for a real, Firebase-authenticated session; false in the demo. */
export function isLiveSession(): boolean {
	return getRealRole() !== null;
}

/** A real session takes priority over a leftover demo pick. */
export function getSessionRole(): Role | null {
	return getRealRole() ?? getDemoRole();
}

/** Detail views that are not pages of their own: they open for whoever can open the page they belong to. */
const DETAIL_OF: Record<string, string> = { booking: 'calendar' };

export function isPageAllowed(role: Role, path: string): boolean {
	return ROLE_PAGES[role].includes(DETAIL_OF[path] ?? path);
}

/** Role and plan together: the page is open only when both allow it (CRM.md → Plans). */
export function isPageAvailable(role: Role, plan: Plan, path: string): boolean {
	return isPageAllowed(role, path) && planIncludes(plan, DETAIL_OF[path] ?? path);
}

/** Home screen for the role on the plan, or null when the plan gives the role no page at all. */
export function defaultPageFor(role: Role, plan: Plan = getStoredPlan()): string | null {
	if (planIncludes(plan, ROLE_HOME[role])) return ROLE_HOME[role];
	return ROLE_PAGES[role].find((path) => planIncludes(plan, path)) ?? null;
}

/** Action authority, separate from page visibility (CRM.md → Data visibility is separate from action authority). */
export type Capability =
	| 'guestBill'
	| 'financeReports'
	| 'salesAnalytics'
	| 'collectPayment'
	| 'refundPayment'
	| 'changeBooking'
	| 'editInventory'
	| 'blockRoom'
	| 'assignCleaning'
	| 'guestBulk'
	| 'manageTeam'
	| 'manageIntegrations';

const CAPABILITIES: Record<Capability, Role[]> = {
	guestBill: ['owner', 'manager', 'reception', 'accountant'],
	financeReports: ['owner', 'manager', 'accountant'],
	salesAnalytics: ['owner', 'manager', 'sales'],
	collectPayment: ['owner', 'manager', 'reception', 'accountant'],
	refundPayment: ['owner', 'manager', 'accountant'],
	changeBooking: ['owner', 'manager', 'reception'],
	editInventory: ['owner', 'manager'],
	blockRoom: ['owner', 'manager'],
	assignCleaning: ['owner', 'manager'],
	guestBulk: ['owner', 'manager'],
	manageTeam: ['owner', 'manager'],
	manageIntegrations: ['owner', 'manager'],
};

export function can(role: Role | null, capability: Capability): boolean {
	return !!role && CAPABILITIES[capability].includes(role);
}

/** Capability check for the current session role. */
export function canCurrent(capability: Capability): boolean {
	return can(getSessionRole(), capability);
}

const ROLE_KEY = 'hotelup_demo_role';

export function getDemoRole(): Role | null {
	try {
		const stored = localStorage.getItem(ROLE_KEY);
		return stored && stored in ROLE_LABEL ? (stored as Role) : null;
	} catch {
		return null;
	}
}

export function setDemoRole(role: Role): void {
	try {
		localStorage.setItem(ROLE_KEY, role);
	} catch {
		/* ignore storage errors (private mode, etc.) */
	}
}

export function clearDemoRole(): void {
	try {
		localStorage.removeItem(ROLE_KEY);
	} catch {
		/* ignore storage errors (private mode, etc.) */
	}
}

const REAL_ROLE_KEY = 'hotelup_real_role';

/**
 * The signed-in Firebase user's real role, stored locally so a returning owner doesn't
 * have to log in every visit. Every Firebase account is an Owner today; its presence marks a
 * live session (isLiveSession), which limits navigation to LIVE_PAGES.
 */
export function getRealRole(): Role | null {
	try {
		const stored = localStorage.getItem(REAL_ROLE_KEY);
		return stored && stored in ROLE_LABEL ? (stored as Role) : null;
	} catch {
		return null;
	}
}

export function setRealRole(role: Role): void {
	try {
		localStorage.setItem(REAL_ROLE_KEY, role);
	} catch {
		/* ignore storage errors (private mode, etc.) */
	}
}

export function clearRealRole(): void {
	try {
		localStorage.removeItem(REAL_ROLE_KEY);
	} catch {
		/* ignore storage errors (private mode, etc.) */
	}
}
