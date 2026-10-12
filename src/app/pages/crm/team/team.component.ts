import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { getStoredPlan, PLAN_ROLES, PLAN_STAFF_LIMIT } from '../../shared/plan';
import { getDemoRole, ROLE_PAGES, type Role } from '../../shared/role';

type Status = 'active' | 'invited' | 'deactivated';
type Segment = 'all' | Role | 'inactive';

interface ActivityItem {
	time: string;
	text: string;
}

interface TaskStats {
	done: number;
	inProgress: number;
	remaining: number;
}

interface TodayStats {
	bookings: number;
	checkins: number;
	payments: number;
}

interface Employee {
	id: number;
	first: string;
	last: string;
	email: string;
	phone: string;
	role: Role;
	status: Status;
	joined?: string;
	invitedOn?: string;
	lastActivity: string;
	online: boolean;
	shift?: string;
	activity?: ActivityItem[];
	perms: Record<string, boolean>;
	notif?: Record<string, boolean>;
	todayStats?: TodayStats;
	tasks?: TaskStats;
}

interface RoleInfo {
	label: string;
	desc: string;
	access: string[];
	optional?: string[];
}

interface InviteData {
	first: string;
	last: string;
	email: string;
	phone: string;
	role: Role;
}

type DialogView =
	| { kind: 'add-employee' }
	| { kind: 'invite-preview'; data: InviteData }
	| { kind: 'invite-sent'; data: InviteData }
	| { kind: 'role-matrix' }
	| { kind: 'change-role'; id: number }
	| { kind: 'edit'; id: number }
	| { kind: 'deactivate'; id: number }
	| null;

const ROLES: Record<Role, RoleInfo> = {
	owner: {
		label: 'Власник',
		desc: 'Повний доступ до Hotel Upwork та управління готелем.',
		access: [
			'Dashboard',
			'Calendar',
			'Бронювання',
			'Гості',
			'Номери',
			'Оплати',
			'Прибирання',
			'Повідомлення',
			'Автоматизації',
			'Продажі',
			'AI',
			'Команда',
			'Налаштування',
			'Дані та експорт',
		],
	},
	manager: {
		label: 'Менеджер',
		desc: 'Керує щоденною роботою готелю та персоналом.',
		access: [
			'Dashboard',
			'Calendar',
			'Бронювання',
			'Гості',
			'Номери',
			'Оплати',
			'Прибирання',
			'Повідомлення',
			'Автоматизації',
			'Продажі',
			'AI',
		],
		optional: ['Команда', 'Налаштування'],
	},
	reception: {
		label: 'Рецепція',
		desc: 'Працює з гостями, бронюваннями, заселенням та оплатами.',
		access: ['Dashboard', 'Calendar', 'Бронювання', 'Гості', 'Номери', 'Оплати', 'Повідомлення', 'AI (операційне)'],
	},
	housekeeping: {
		label: 'Прибирання',
		desc: 'Бачить лише інформацію, необхідну для підготовки номерів.',
		access: ['Мої задачі', 'Прибирання', 'базова інформація про номери'],
	},
	sales: {
		label: 'Продажі / Маркетинг',
		desc: 'Запити, пропозиції, доступність та агрегована аналітика каналів.',
		access: ['Calendar (без платежів гостей)', 'Продажі', 'AI (обмежено)'],
	},
	accountant: {
		label: 'Бухгалтер',
		desc: 'Оплати, звірка та перегляд підтвердних документів бронювань.',
		access: ['Оплати', 'Звірка', 'AI (обмежено)'],
	},
	maintenance: {
		label: 'Технічне обслуговування',
		desc: 'Черга ремонтів без даних гостей та цін.',
		access: ['Номери (технічний стан)', 'Прибирання (ремонти)', 'AI (обмежено)'],
	},
};

const MATRIX_PAGES: [string, string][] = [
	['Dashboard', 'dashboard'],
	['Calendar', 'calendar'],
	['Заявки', 'submissions'],
	['Гості', 'guests'],
	['Номери', 'rooms'],
	['Оплати', 'payments'],
	['Прибирання', 'housekeeping'],
	['Повідомлення', 'messages'],
	['Автоматизації', 'automations'],
	['Продажі', 'sales'],
	['AI', 'ai'],
	['Команда', 'team'],
	['Налаштування', 'settings'],
];

const MATRIX_ROLES: Role[] = ['owner', 'manager', 'reception', 'housekeeping', 'sales', 'accountant', 'maintenance'];

/** Roles a viewer may assign. Owner is never assignable here; Manager cannot grant Manager-level access. */
const ASSIGNABLE_BY: Partial<Record<Role, Role[]>> = {
	owner: ['manager', 'reception', 'housekeeping', 'sales', 'accountant', 'maintenance'],
	manager: ['reception', 'housekeeping', 'sales', 'accountant', 'maintenance'],
};

const SEED_EMPLOYEES: Employee[] = [
	{
		id: 1,
		first: 'Олександр',
		last: 'Гончар',
		email: 'oleksandr@example.com',
		phone: '+380 67 111 22 33',
		role: 'owner',
		status: 'active',
		joined: '1 січня 2026',
		lastActivity: 'сьогодні · 15:24',
		online: true,
		activity: [
			{ time: '15:24', text: 'Змінив статус номера 204' },
			{ time: '11:02', text: 'Переглянув звіт продажів' },
		],
		perms: {},
	},
	{
		id: 2,
		first: 'Марія',
		last: 'Коваль',
		email: 'maria@example.com',
		phone: '+380 63 222 33 44',
		role: 'manager',
		status: 'active',
		joined: '4 серпня 2026',
		lastActivity: '12 хв тому',
		online: true,
		activity: [
			{ time: '15:18', text: 'Створила бронювання #1847' },
			{ time: '14:42', text: 'Додала оплату 1 500 ₴' },
			{ time: '13:16', text: 'Заселила Анну Коваленко' },
		],
		perms: { canRefund: true, canManageTeam: false, canEditSettings: false },
		todayStats: { bookings: 4, checkins: 3, payments: 6 },
	},
	{
		id: 3,
		first: 'Ірина',
		last: 'Петренко',
		email: 'iryna@example.com',
		phone: '+380 97 333 44 55',
		role: 'reception',
		status: 'active',
		joined: '12 серпня 2026',
		lastActivity: '34 хв тому',
		online: true,
		shift: '08:00–20:00',
		activity: [
			{ time: '12:58', text: 'Змінила номер у бронюванні #1841' },
			{ time: '11:20', text: 'Додала оплату 800 ₴' },
		],
		perms: { canCancelBooking: false },
	},
	{
		id: 4,
		first: 'Олена',
		last: 'Бондар',
		email: 'olena@example.com',
		phone: '+380 66 444 55 66',
		role: 'housekeeping',
		status: 'active',
		joined: '20 серпня 2026',
		lastActivity: '2 год тому',
		online: false,
		tasks: { done: 5, inProgress: 1, remaining: 2 },
		activity: [
			{ time: '12:20', text: 'Розпочала прибирання номера 207' },
			{ time: '11:41', text: 'Завершила прибирання номера 103' },
		],
		perms: { canSupervise: true },
	},
	{
		id: 5,
		first: 'Оксана',
		last: 'Мельник',
		email: 'oksana@example.com',
		phone: '+380 50 555 66 77',
		role: 'housekeeping',
		status: 'active',
		joined: '2 вересня 2026',
		lastActivity: 'вчора · 18:10',
		online: false,
		tasks: { done: 4, inProgress: 0, remaining: 0 },
		activity: [{ time: '17:55', text: 'Завершила прибирання номера 101' }],
		perms: {},
	},
	{
		id: 6,
		first: 'Тарас',
		last: 'Швець',
		email: 'taras@example.com',
		phone: '+380 63 666 77 88',
		role: 'reception',
		status: 'active',
		joined: '5 вересня 2026',
		lastActivity: '3 дні тому',
		online: false,
		shift: '20:00–08:00',
		activity: [{ time: '20:40', text: 'Заселив Олега Бондаря' }],
		perms: { canCancelBooking: false },
	},
	{
		id: 8,
		first: 'Андрій',
		last: 'Литвин',
		email: 'andrii@example.com',
		phone: '+380 67 777 88 99',
		role: 'sales',
		status: 'active',
		joined: '10 серпня 2026',
		lastActivity: '1 год тому',
		online: true,
		activity: [{ time: '14:05', text: 'Підготував пропозицію для запиту від Instagram' }],
		perms: {},
	},
	{
		id: 9,
		first: 'Наталія',
		last: 'Кравець',
		email: 'natalia@example.com',
		phone: '+380 50 888 99 00',
		role: 'accountant',
		status: 'active',
		joined: '1 вересня 2026',
		lastActivity: 'сьогодні · 10:12',
		online: false,
		activity: [{ time: '10:12', text: 'Позначила розбіжність у платежі #P-2291' }],
		perms: { canRefund: true },
	},
	{
		id: 10,
		first: 'Сергій',
		last: 'Бойко',
		email: 'serhii@example.com',
		phone: '+380 63 999 00 11',
		role: 'maintenance',
		status: 'active',
		joined: '15 серпня 2026',
		lastActivity: '25 хв тому',
		online: true,
		activity: [{ time: '14:50', text: 'Взяв у роботу кондиціонер у номері 56' }],
		perms: {},
	},
	{
		id: 7,
		first: 'Юлія',
		last: 'Савчук',
		email: 'yulia@example.com',
		phone: '',
		role: 'reception',
		status: 'invited',
		invitedOn: '17 вересня · 15:20',
		lastActivity: '-',
		online: false,
		perms: {},
	},
];

const fullName = (e: Employee) => e.first + ' ' + e.last;
const statusLabel = (s: Status) => ({ active: 'Активний', invited: 'Запрошено', deactivated: 'Деактивований' })[s];
const initials = (n: string) =>
	n
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('');

const PERM_MAP: Record<Role, [string, string][]> = {
	owner: [],
	manager: [
		['canRefund', 'Може здійснювати повернення'],
		['canManageTeam', 'Може керувати командою'],
		['canEditSettings', 'Може змінювати налаштування'],
	],
	reception: [['canCancelBooking', 'Може скасовувати бронювання']],
	housekeeping: [['canSupervise', 'Супервайзер прибирання: призначає та перевіряє']],
	sales: [['canChangeBookings', 'Може змінювати бронювання поза своїми запитами']],
	accountant: [['canRefund', 'Може здійснювати повернення та перерозподіл']],
	maintenance: [],
};

const NOTIF_OPTS: [string, string][] = [
	['notifyBooking', 'Нове бронювання'],
	['notifyMessage', 'Нове повідомлення'],
	['notifyPayment', 'Оплата'],
	['notifyHousekeeping', 'Housekeeping alerts'],
	['notifyAutomation', 'Automation errors'],
];

const defaultNotif = (role: Role): Record<string, boolean> => ({
	notifyBooking: true,
	notifyMessage: true,
	notifyPayment: role === 'owner' || role === 'manager' || role === 'reception' || role === 'accountant',
	notifyHousekeeping: role === 'housekeeping' || role === 'maintenance' || role === 'owner' || role === 'manager',
	notifyAutomation: role === 'owner' || role === 'manager',
});

@Component({
	selector: 'app-team',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './team.component.html',
	styleUrl: './team.component.scss',
})
export class TeamComponent {
	protected readonly ROLES = ROLES;
	protected readonly MATRIX_PAGES = MATRIX_PAGES;
	protected readonly MATRIX_ROLES = MATRIX_ROLES;
	protected readonly viewerRole: Role = getDemoRole() ?? 'owner';
	/** Roles the viewer may grant, limited to roles usable on the hotel's plan (CRM.md → Plans). */
	protected readonly ASSIGNABLE_ROLES: Role[] = (ASSIGNABLE_BY[this.viewerRole] ?? []).filter((r) =>
		PLAN_ROLES[getStoredPlan()].includes(r),
	);
	protected readonly NOTIF_OPTS = NOTIF_OPTS;
	protected readonly fullName = fullName;
	protected readonly statusLabel = statusLabel;
	protected readonly initials = initials;

	/** Staff account cap on the hotel's plan (CRM.md → Plans), null = unlimited. */
	protected readonly staffLimit = PLAN_STAFF_LIMIT[getStoredPlan()];
	protected readonly employees = signal<Employee[]>(
		SEED_EMPLOYEES.filter((e) => PLAN_ROLES[getStoredPlan()].includes(e.role))
			.slice(0, this.staffLimit ?? undefined)
			.map((e) => ({ ...e, perms: { ...e.perms } })),
	);
	/** Active and invited accounts count toward the plan limit; deactivated ones do not. */
	protected readonly staffLimitReached = computed(
		() => this.staffLimit !== null && this.employees().filter((e) => e.status !== 'deactivated').length >= this.staffLimit,
	);
	protected readonly segment = signal<Segment>('all');
	protected readonly search = signal('');
	protected readonly selectedId = signal<number | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly counts = computed(() => {
		const list = this.employees();
		return {
			total: list.length,
			active: list.filter((e) => e.status === 'active').length,
			invited: list.filter((e) => e.status === 'invited').length,
			online: list.filter((e) => e.online).length,
		};
	});

	protected readonly filtered = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const seg = this.segment();
		return this.employees().filter((e) => {
			if (q && !(fullName(e) + ' ' + e.email + ' ' + e.phone + ' ' + ROLES[e.role].label).toLocaleLowerCase('uk-UA').includes(q)) {
				return false;
			}
			if (seg === 'inactive') return e.status === 'deactivated';
			if (seg !== 'all') return e.role === seg;
			return true;
		});
	});

	protected readonly selectedEmployee = computed(() => {
		const id = this.selectedId();
		return id === null ? undefined : this.employee(id);
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
	}

	protected employee(id: number): Employee | undefined {
		return this.employees().find((e) => e.id === id);
	}

	protected isLastOwner(e: Employee): boolean {
		return e.role === 'owner' && this.employees().filter((x) => x.role === 'owner' && x.status === 'active').length <= 1;
	}

	protected permsFor(e: Employee): [string, string][] {
		return PERM_MAP[e.role];
	}

	protected notifFor(e: Employee): Record<string, boolean> {
		if (!e.notif) {
			e.notif = defaultNotif(e.role);
			this.employees.update((list) => list.map((x) => (x.id === e.id ? { ...x, notif: e.notif } : x)));
		}
		return e.notif;
	}

	protected matrixCell(page: string, role: Role): string {
		if (!ROLE_PAGES[role].includes(page)) return '-';
		if (page === 'ai' && role !== 'owner' && role !== 'manager') return 'обмежено';
		return '✓';
	}

	/** Owner manages everyone; Manager manages operational staff only, never Owners or other Managers. */
	protected canManage(e: Employee): boolean {
		if (this.viewerRole === 'owner') return true;
		if (this.viewerRole === 'manager') return e.role !== 'owner' && e.role !== 'manager';
		return false;
	}

	protected setSegment(seg: Segment): void {
		this.segment.set(seg);
	}

	private staffLimitMessage(): string {
		return `Ліміт працівників на цьому тарифі: ${this.staffLimit}. Перейдіть на вищий тариф, щоб додати більше.`;
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
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

	protected openProfile(id: number): void {
		this.selectedId.set(id);
	}

	protected closeSidePanel(): void {
		this.selectedId.set(null);
	}

	protected openAddEmployee(): void {
		if (this.staffLimitReached()) {
			this.toast(this.staffLimitMessage());
			return;
		}
		this.dialogView.set({ kind: 'add-employee' });
	}

	protected openRoleMatrix(): void {
		this.dialogView.set({ kind: 'role-matrix' });
	}

	protected submitAddForm(first: string, last: string, email: string, phone: string, role: Role): void {
		const f = first.trim();
		const em = email.trim();
		if (!f || !em) {
			this.toast('Вкажіть ім’я та email');
			return;
		}
		this.dialogView.set({ kind: 'invite-preview', data: { first: f, last: last.trim(), email: em, phone: phone.trim(), role } });
	}

	protected sendInvite(data: InviteData): void {
		if (this.staffLimitReached()) {
			this.toast(this.staffLimitMessage());
			return;
		}
		const id = Math.max(...this.employees().map((e) => e.id)) + 1;
		const employee: Employee = {
			id,
			first: data.first,
			last: data.last,
			email: data.email,
			phone: data.phone,
			role: data.role,
			status: 'invited',
			invitedOn: '17 вересня · зараз',
			lastActivity: '-',
			online: false,
			perms: {},
		};
		this.employees.update((list) => [...list, employee]);
		this.closeDialog();
		setTimeout(() => this.dialogView.set({ kind: 'invite-sent', data }), 150);
	}

	protected copyInviteLink(): void {
		navigator.clipboard?.writeText('https://hotelup.work/invite/DEMO-TOKEN').catch(() => {});
		this.toast('Посилання скопійовано');
	}

	protected resendInvite(): void {
		this.toast('Запрошення надіслано повторно');
	}

	protected cancelInvite(id: number): void {
		this.employees.update((list) => list.filter((e) => e.id !== id));
		this.closeSidePanel();
		this.closeDialog();
		this.toast('Запрошення скасовано');
	}

	protected openEdit(id: number): void {
		this.dialogView.set({ kind: 'edit', id });
	}

	protected submitEdit(id: number, first: string, last: string, email: string, phone: string): void {
		this.employees.update((list) => list.map((e) => (e.id === id ? { ...e, first, last, email, phone } : e)));
		this.closeDialog();
		this.openProfile(id);
		this.toast('Зміни збережено');
	}

	protected openChangeRole(id: number): void {
		this.dialogView.set({ kind: 'change-role', id });
	}

	protected submitChangeRole(id: number, role: Role): void {
		const emp = this.employee(id);
		if (!emp || !this.canManage(emp) || !this.ASSIGNABLE_ROLES.includes(role)) {
			this.toast('Недостатньо прав для цієї зміни');
			return;
		}
		if (this.isLastOwner(emp)) {
			this.toast('Готель повинен мати щонайменше одного власника');
			return;
		}
		this.employees.update((list) => list.map((e) => (e.id === id ? { ...e, role } : e)));
		this.closeDialog();
		this.openProfile(id);
		this.toast('Роль змінено');
	}

	protected openDeactivate(id: number): void {
		this.dialogView.set({ kind: 'deactivate', id });
	}

	protected confirmDeactivate(id: number): void {
		const emp = this.employee(id);
		if (!emp || !this.canManage(emp) || this.isLastOwner(emp)) return;
		this.employees.update((list) => list.map((e) => (e.id === id ? { ...e, status: 'deactivated', online: false } : e)));
		this.closeDialog();
		this.closeSidePanel();
		this.toast('Доступ деактивовано');
	}

	protected reactivate(id: number): void {
		if (this.staffLimitReached()) {
			this.toast(this.staffLimitMessage());
			return;
		}
		this.employees.update((list) => list.map((e) => (e.id === id ? { ...e, status: 'active' } : e)));
		this.closeSidePanel();
		this.toast('Доступ відновлено');
	}

	protected togglePerm(id: number, key: string): void {
		const emp = this.employee(id);
		if (!emp || !this.canManage(emp)) return;
		this.employees.update((list) =>
			list.map((e) => (e.id === id ? { ...e, perms: { ...e.perms, [key]: !e.perms[key] } } : e)),
		);
		this.toast('Дозвіл оновлено');
	}

	protected toggleNotif(id: number, key: string): void {
		this.employees.update((list) =>
			list.map((e) => (e.id === id ? { ...e, notif: { ...(e.notif ?? defaultNotif(e.role)), [key]: !(e.notif?.[key] ?? defaultNotif(e.role)[key]) } } : e)),
		);
	}

	protected endSessions(): void {
		this.toast('Усі сесії завершено');
	}
}
