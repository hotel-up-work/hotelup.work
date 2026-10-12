import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent, getDemoRole, isPageAllowed } from '../../shared/role';

type Status = 'needs-cleaning' | 'cleaning' | 'ready' | 'occupied';
type Priority = 'critical' | 'high' | 'normal' | 'low' | null;
type DayFilter = 'today' | 'tomorrow' | 'all';
type ViewMode = 'board' | 'list';
type SortKey = 'arrival' | 'room' | 'checkout' | 'staff';

interface HistoryEntry {
	date: string;
	by: string;
	range: string;
	dur: string;
	status: string;
}

interface Room {
	number: string;
	type: string;
	capacity: number;
	status: Status;
	assigned: string | null;
	cleanedAt?: string;
	cleanedBy?: string;
	checkoutTime?: string;
	nextArrivalDate?: string | null;
	nextArrivalTime?: string | null;
	nextGuests?: number;
	prep?: string[];
	internalNote?: string;
	startedAt?: string;
	guest?: string;
	checkoutDate?: string;
	doNotDisturb?: boolean;
	history: HistoryEntry[];
}

type DialogView =
	| { kind: 'assign'; room: string }
	| { kind: 'add-task' }
	| { kind: 'issue'; room: string }
	| { kind: 'block-followup'; room: string }
	| { kind: 'complete'; room: string }
	| { kind: 'distribute' }
	| null;

type Alert =
	| { kind: 'not-ready'; room: Room; countdown: string }
	| { kind: 'unassigned-task'; room: Room }
	| { kind: 'long-clean'; room: Room; minutes: number }
	| { kind: 'unassigned-count'; count: number };

const NOW = new Date('2026-09-17T12:00:00');
const TODAY = '2026-09-17';
const TOMORROW = '2026-09-18';
const STAFF_LIST = ['Марія', 'Олена', 'Ірина'];
const CHECKLIST = [
	'Постіль замінена',
	'Ванна прибрана',
	'Рушники замінені',
	'Сміття винесено',
	'Мінібар перевірено',
	'Поверхні прибрані',
	'Номер перевірено',
];
const ISSUE_TYPES = ['Освітлення', 'Сантехніка', 'Кондиціонер', 'Меблі', 'Техніка', 'Інше'];
const TASK_TYPES = ['Прибирання після виїзду', 'Додаткове прибирання', 'Заміна білизни', 'Підготовка номера', 'Інше'];
const TEAM_TODAY: [string, number, number][] = [
	['Марія', 6, 1],
	['Олена', 4, 0],
	['Ірина', 3, 1],
];

function mins(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 60000);
}
function timeLabel(d: Date): string {
	return d.toTimeString().slice(0, 5);
}

function buildRooms(): Room[] {
	const TYPES: Record<string, number> = { Стандарт: 2, Покращений: 3, Люкс: 2, Апартаменти: 4 };
	const list: Room[] = [];
	let n = 0;
	const push = (number: string, type: string) =>
		list.push({
			number,
			type,
			capacity: TYPES[type],
			status: 'ready',
			assigned: null,
			cleanedAt: '11:10',
			cleanedBy: STAFF_LIST[n++ % STAFF_LIST.length],
			history: [],
		});
	for (let i = 101; i <= 110; i++) push(String(i), 'Стандарт');
	for (let i = 111; i <= 114; i++) push(String(i), 'Покращений');
	for (let i = 201; i <= 208; i++) push(String(i), 'Люкс');
	for (let i = 301; i <= 306; i++) push(String(i), 'Апартаменти');
	const set = (num: string, o: Partial<Room>) => Object.assign(list.find((r) => r.number === num)!, o);

	set('204', {
		status: 'needs-cleaning',
		type: 'Люкс',
		checkoutTime: '11:08',
		nextArrivalDate: TODAY,
		nextArrivalTime: '13:30',
		nextGuests: 2,
		assigned: null,
		prep: ['Дитяче ліжечко'],
		internalNote: 'Тихий номер',
	});
	set('106', {
		status: 'needs-cleaning',
		type: 'Покращений',
		checkoutTime: '09:50',
		nextArrivalDate: TODAY,
		nextArrivalTime: '16:30',
		nextGuests: 2,
		assigned: null,
		prep: [],
		internalNote: '',
	});
	set('302', {
		status: 'needs-cleaning',
		type: 'Апартаменти',
		checkoutTime: '10:40',
		nextArrivalDate: TOMORROW,
		nextArrivalTime: '14:00',
		nextGuests: 4,
		assigned: null,
		prep: ['2 додаткові рушники'],
		internalNote: '',
	});

	set('207', {
		status: 'cleaning',
		type: 'Стандарт',
		assigned: 'Марія',
		startedAt: '12:20',
		nextArrivalDate: TODAY,
		nextArrivalTime: '15:00',
		nextGuests: 2,
		prep: [],
		internalNote: '',
	});
	set('206', {
		status: 'cleaning',
		type: 'Люкс',
		assigned: 'Ірина',
		startedAt: '11:05',
		nextArrivalDate: null,
		nextArrivalTime: null,
		prep: [],
		internalNote: '',
	});

	set('103', { status: 'ready', type: 'Стандарт', cleanedAt: '11:42', cleanedBy: 'Марія', nextArrivalDate: TOMORROW, nextArrivalTime: '14:00' });
	set('205', { status: 'ready', type: 'Люкс', cleanedAt: '10:20', cleanedBy: 'Ірина', nextArrivalDate: null, nextArrivalTime: null });

	set('301', { status: 'occupied', type: 'Апартаменти', guest: 'Анна Коваленко', checkoutDate: '20 вересня', doNotDisturb: true });
	const occupiedExtra = ['201', '101', '111', '303'];
	const occGuests = ['Олег Бондар', 'Марія Петренко', 'Ірина Шевченко', 'Дмитро Левченко'];
	const occDates = ['18 вересня', '21 вересня', '19 вересня', '23 вересня'];
	occupiedExtra.forEach((num, i) =>
		set(num, { status: 'occupied', guest: occGuests[i], checkoutDate: occDates[i], doNotDisturb: i === 1 }),
	);

	list.forEach((r) => {
		r.history = [
			{ date: '17 вересня', by: r.cleanedBy || 'Марія', range: '11:12–11:41', dur: '29 хв', status: 'Completed' },
			{ date: '15 вересня', by: 'Олена', range: '10:54–11:28', dur: '34 хв', status: 'Completed' },
		];
	});
	return list;
}

const SEED_ROOMS = buildRooms();

function priorityOf(r: Room): Priority {
	if (r.status !== 'needs-cleaning') return null;
	if (!r.nextArrivalDate) return 'low';
	if (r.nextArrivalDate === TOMORROW) return 'low';
	const arrival = new Date(r.nextArrivalDate + 'T' + r.nextArrivalTime + ':00');
	const diff = mins(NOW, arrival);
	if (diff <= 60) return 'critical';
	if (diff <= 180) return 'high';
	return 'normal';
}
function priorityLabel(p: Priority): string {
	return (p && { critical: 'Критично', high: 'Високий', normal: 'Звичайний', low: 'Низький' }[p]) || '';
}
function countdown(r: Room): string {
	if (!r.nextArrivalDate) return '';
	const arrival = new Date(r.nextArrivalDate + 'T' + r.nextArrivalTime + ':00');
	const diff = mins(NOW, arrival);
	if (diff < 0) return 'заїзд уже почався';
	const h = Math.floor(diff / 60),
		m = diff % 60;
	return (h ? h + ' год ' : '') + m + ' хв';
}
function nextArrivalLabel(r: Room): string {
	if (!r.nextArrivalDate) return '-';
	if (r.nextArrivalDate === TODAY) return r.nextArrivalTime!;
	if (r.nextArrivalDate === TOMORROW) return 'завтра · ' + r.nextArrivalTime;
	return r.nextArrivalDate + ' · ' + r.nextArrivalTime;
}
function cleaningDuration(r: Room): number {
	return mins(new Date(TODAY + 'T' + r.startedAt + ':00'), NOW);
}
const STATUS_LABEL: Record<Status, string> = {
	'needs-cleaning': 'Потребує прибирання',
	cleaning: 'Прибирається',
	ready: 'Готовий',
	occupied: 'Зайнятий',
};

@Component({
	selector: 'app-housekeeping',
	imports: [AppShellComponent, IconComponent, FormsModule, NgTemplateOutlet, RouterLink],
	templateUrl: './housekeeping.component.html',
	styleUrl: './housekeeping.component.scss',
})
export class HousekeepingComponent {
	protected readonly showTeamLink = (() => {
		const role = getDemoRole();
		return !role || isPageAllowed(role, 'team');
	})();
	protected readonly canAssign = canCurrent('assignCleaning');
	protected readonly canBlockRoom = canCurrent('blockRoom');
	protected readonly STAFF_LIST = STAFF_LIST;
	protected readonly CHECKLIST = CHECKLIST;
	protected readonly ISSUE_TYPES = ISSUE_TYPES;
	protected readonly TASK_TYPES = TASK_TYPES;
	protected readonly TEAM_TODAY = TEAM_TODAY;
	protected readonly priorityLabel = priorityLabel;
	protected readonly nextArrivalLabel = nextArrivalLabel;
	protected readonly countdown = countdown;
	protected readonly cleaningDuration = cleaningDuration;
	protected readonly STATUS_LABEL = STATUS_LABEL;

	protected readonly rooms = signal<Room[]>(SEED_ROOMS.map((r) => ({ ...r, history: [...r.history] })));
	protected readonly dayFilter = signal<DayFilter>('today');
	protected readonly viewMode = signal<ViewMode>('board');
	protected readonly mobileTab = signal<Status>('needs-cleaning');
	protected readonly sort = signal<SortKey>('arrival');
	protected readonly staffFilter = signal(new Set<string>([...STAFF_LIST, 'Не призначено']));
	protected readonly priorityFilter = signal(new Set<Exclude<Priority, null>>(['critical', 'high', 'normal', 'low']));
	protected readonly filtersOpen = signal(false);
	protected readonly selectedRoom = signal<string | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly aiKey = signal<string | null>(null);

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly counts = computed(() => {
		const list = this.rooms();
		return {
			needs: list.filter((r) => r.status === 'needs-cleaning').length,
			cleaning: list.filter((r) => r.status === 'cleaning').length,
			ready: list.filter((r) => r.status === 'ready').length,
			occupied: list.filter((r) => r.status === 'occupied').length,
		};
	});

	protected readonly urgentCount = computed(
		() => this.rooms().filter((r) => r.status === 'needs-cleaning' && priorityOf(r) === 'critical').length,
	);

	private passesFilters(r: Room): boolean {
		const assignedLabel = r.assigned || 'Не призначено';
		if (!this.staffFilter().has(assignedLabel) && r.status !== 'ready' && r.status !== 'occupied') return false;
		const p = priorityOf(r);
		if (p && !this.priorityFilter().has(p)) return false;
		return true;
	}

	private dayPasses(r: Room): boolean {
		const day = this.dayFilter();
		if (day === 'all') return true;
		if (r.status === 'ready' || r.status === 'occupied') return true;
		if (!r.nextArrivalDate) return day === 'today';
		return r.nextArrivalDate === (day === 'today' ? TODAY : TOMORROW);
	}

	private sortRooms(list: Room[]): Room[] {
		const sorters: Record<SortKey, (a: Room, b: Room) => number> = {
			arrival: (a, b) => {
				const av = a.nextArrivalDate ? new Date(a.nextArrivalDate + 'T' + a.nextArrivalTime + ':00').getTime() : new Date('2100-01-01').getTime();
				const bv = b.nextArrivalDate ? new Date(b.nextArrivalDate + 'T' + b.nextArrivalTime + ':00').getTime() : new Date('2100-01-01').getTime();
				return av - bv;
			},
			room: (a, b) => a.number.localeCompare(b.number, 'uk', { numeric: true }),
			checkout: (a, b) => (a.checkoutTime || '99:99').localeCompare(b.checkoutTime || '99:99'),
			staff: (a, b) => (a.assigned || 'zzz').localeCompare(b.assigned || 'zzz', 'uk'),
		};
		return list.slice().sort(sorters[this.sort()]);
	}

	protected filteredByStatus(status: Status): Room[] {
		return this.sortRooms(this.rooms().filter((r) => r.status === status && this.passesFilters(r) && this.dayPasses(r)));
	}

	protected readonly boardColumns = computed(() => {
		void this.rooms();
		void this.dayFilter();
		void this.staffFilter();
		void this.priorityFilter();
		void this.sort();
		const cols: { cls: string; status: Status; label: string; list: Room[] }[] = [
			{ cls: 'needs', status: 'needs-cleaning', label: 'ПОТРЕБУЮТЬ ПРИБИРАННЯ', list: [] },
			{ cls: 'cleaning', status: 'cleaning', label: 'ПРИБИРАЮТЬСЯ', list: [] },
			{ cls: 'ready', status: 'ready', label: 'ГОТОВІ', list: [] },
			{ cls: 'occupied', status: 'occupied', label: 'ЗАЙНЯТІ', list: [] },
		];
		cols.forEach((c) => (c.list = this.filteredByStatus(c.status)));
		return cols;
	});

	protected readonly listRows = computed(() =>
		this.sortRooms(this.rooms().filter((r) => this.passesFilters(r) && this.dayPasses(r))).map((r) => ({
			room: r,
			priority: priorityOf(r),
		})),
	);

	protected readonly mobileCards = computed(() => this.filteredByStatus(this.mobileTab()));

	protected readonly anyActive = computed(() => this.counts().needs + this.counts().cleaning > 0);
	protected readonly isEmpty = computed(() => !this.anyActive() && this.dayFilter() !== 'all');

	protected readonly alerts = computed<Alert[]>(() => {
		const list: Alert[] = [];
		this.rooms()
			.filter((r) => r.status === 'needs-cleaning')
			.forEach((r) => {
				if (r.nextArrivalDate === TODAY) {
					const diff = mins(NOW, new Date(r.nextArrivalDate + 'T' + r.nextArrivalTime + ':00'));
					if (diff > 0 && diff <= 60) list.push({ kind: 'not-ready', room: r, countdown: countdown(r) });
				}
				if (!r.assigned && (priorityOf(r) === 'critical' || priorityOf(r) === 'high')) {
					list.push({ kind: 'unassigned-task', room: r });
				}
			});
		this.rooms()
			.filter((r) => r.status === 'cleaning')
			.forEach((r) => {
				const started = new Date(TODAY + 'T' + r.startedAt + ':00');
				if (mins(started, NOW) > 45) list.push({ kind: 'long-clean', room: r, minutes: mins(started, NOW) });
			});
		const unassignedCount = this.rooms().filter((r) => r.status === 'needs-cleaning' && !r.assigned).length;
		if (unassignedCount) list.push({ kind: 'unassigned-count', count: unassignedCount });
		return list;
	});

	protected readonly unassignedRooms = computed(() => this.rooms().filter((r) => r.status === 'needs-cleaning' && !r.assigned));

	protected readonly aiAnswerHtml = computed<string | null>(() => {
		const key = this.aiKey();
		if (!key) return null;
		const rooms = this.rooms();
		const notReady = rooms.filter((r) => r.status === 'needs-cleaning' || r.status === 'cleaning');
		const order: Priority[] = ['critical', 'high', 'normal', 'low'];
		const first = rooms
			.filter((r) => r.status === 'needs-cleaning')
			.slice()
			.sort((a, b) => order.indexOf(priorityOf(a)) - order.indexOf(priorityOf(b)))[0];
		const room204 = rooms.find((r) => r.number === '204');
		const soon = rooms.filter((r) => {
			if (r.nextArrivalDate !== TODAY) return false;
			const diff = mins(NOW, new Date(r.nextArrivalDate + 'T' + r.nextArrivalTime + ':00'));
			return diff <= 120 && diff >= 0;
		});
		const unassigned = rooms.filter((r) => r.status === 'needs-cleaning' && !r.assigned);
		const map: Record<string, string> = {
			notReady: notReady.length
				? `<p>${notReady.map((r) => `${r.number}: ${r.status === 'cleaning' ? 'прибирається' : 'потребує прибирання'}`).join('<br>')}</p>`
				: '<p>Усі номери готові.</p>',
			firstPriority: first
				? `<p>В першу чергу: <b>${first.number} · ${first.type}</b>, пріоритет «${priorityLabel(priorityOf(first))}».</p>`
				: '<p>Немає номерів, що потребують прибирання.</p>',
			whoCleaning:
				room204 && room204.status === 'cleaning'
					? `<p>Номер 204 прибирає <b>${room204.assigned}</b>.</p>`
					: '<p>Номер 204 наразі не прибирається.</p>',
			soonArrivals: soon.length
				? `<p>${soon.map((r) => `${r.number}: заїзд о ${r.nextArrivalTime}`).join('<br>')}</p>`
				: '<p>Найближчими 2 годинами заїздів не заплановано.</p>',
			unassigned: unassigned.length
				? `<p>Так, ${unassigned.length} непризначені задачі: ${unassigned.map((r) => r.number).join(', ')}.</p>`
				: '<p>Непризначених задач немає.</p>',
		};
		return map[key] || '<p>AI відповідає лише на основі даних прибирання.</p>';
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

	protected room(number: string): Room | undefined {
		return this.rooms().find((r) => r.number === number);
	}

	protected priorityOf(r: Room): Priority {
		return priorityOf(r);
	}

	protected setDayFilter(day: DayFilter): void {
		this.dayFilter.set(day);
	}

	protected setViewMode(mode: ViewMode): void {
		this.viewMode.set(mode);
	}

	protected setMobileTab(tab: Status): void {
		this.mobileTab.set(tab);
	}

	protected setSort(sort: SortKey): void {
		this.sort.set(sort);
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleStaffFilter(staff: string, checked: boolean): void {
		this.staffFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(staff) : next.delete(staff);
			return next;
		});
	}

	protected togglePriorityFilter(priority: Exclude<Priority, null>, checked: boolean): void {
		this.priorityFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(priority) : next.delete(priority);
			return next;
		});
	}

	protected clearFilters(): void {
		this.staffFilter.set(new Set([...STAFF_LIST, 'Не призначено']));
		this.priorityFilter.set(new Set(['critical', 'high', 'normal', 'low']));
	}

	protected applyFilters(): void {
		this.filtersOpen.set(false);
	}

	protected askAi(key: string): void {
		this.aiKey.set(key);
	}

	protected openRoomPanel(number: string): void {
		if (!this.room(number)) return;
		this.selectedRoom.set(number);
	}

	protected closeSidePanel(): void {
		this.selectedRoom.set(null);
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected openAssign(number: string): void {
		if (!this.canAssign) return;
		this.dialogView.set({ kind: 'assign', room: number });
	}

	protected openAddTask(): void {
		this.dialogView.set({ kind: 'add-task' });
	}

	protected openIssue(number: string): void {
		this.dialogView.set({ kind: 'issue', room: number });
	}

	protected openComplete(number: string): void {
		this.dialogView.set({ kind: 'complete', room: number });
	}

	protected openDistribute(): void {
		if (!this.canAssign) return;
		this.dialogView.set({ kind: 'distribute' });
	}

	protected startCleaning(number: string): void {
		const r = this.room(number);
		if (!r) return;
		this.rooms.update((list) =>
			list.map((x) => (x.number === number ? { ...x, status: 'cleaning', assigned: x.assigned || 'Марія', startedAt: timeLabel(NOW) } : x)),
		);
		this.closeDialog();
		this.openRoomPanel(number);
		this.toast('Прибирання розпочато');
	}

	protected confirmComplete(number: string): void {
		this.rooms.update((list) =>
			list.map((x) =>
				x.number === number ? { ...x, status: 'ready', cleanedAt: timeLabel(NOW), cleanedBy: x.assigned || 'Марія', assigned: null } : x,
			),
		);
		this.closeDialog();
		this.closeSidePanel();
		this.toast('Номер ' + number + ' готовий');
	}

	protected requestBlock(number: string): void {
		this.closeDialog();
		this.toast(`Номер ${number}: запит на блокування надіслано менеджеру`);
	}

	protected confirmBlock(number: string): void {
		if (!this.canBlockRoom) return;
		this.closeDialog();
		this.toast('Номер позначено недоступним · Демо');
	}

	protected submitAssign(number: string, staff: string): void {
		this.rooms.update((list) => list.map((x) => (x.number === number ? { ...x, assigned: staff || null } : x)));
		this.closeDialog();
		this.toast(staff ? 'Призначено: ' + staff : 'Призначення знято');
	}

	protected submitAddTask(): void {
		this.closeDialog();
		this.toast('Задачу створено · Демо');
	}

	protected submitIssue(number: string, priority: string): void {
		this.closeDialog();
		this.toast('Проблему надіслано · Демо');
		if (priority === 'Термінова') setTimeout(() => this.dialogView.set({ kind: 'block-followup', room: number }), 300);
	}

	protected addPhoto(): void {
		this.toast('Додавання фото: демо');
	}

	private _distribution = new Map<string, string>();

	protected setDistribution(number: string, staff: string): void {
		this._distribution.set(number, staff);
	}

	protected saveDistribution(): void {
		this.rooms.update((list) =>
			list.map((x) => (this._distribution.has(x.number) ? { ...x, assigned: this._distribution.get(x.number) || null } : x)),
		);
		this._distribution.clear();
		this.closeDialog();
		this.toast('Задачі розподілено');
	}
}
