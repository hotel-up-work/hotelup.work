import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent } from '../../shared/role';

interface Guest {
	id: number;
	name: string;
	phone: string;
	email: string;
	tags: string[];
	stays: number;
	nights: number;
	spent: number;
	lastVisit: string | null;
	nextBooking: string | null;
	room: string | null;
	staying: boolean;
	prefs: string[];
}

type Segment = 'all' | 'staying' | 'upcoming' | 'regular' | 'new' | 'away';
type Sort = 'activity' | 'name' | 'stays' | 'spent' | 'visit';

type DialogView =
	| { kind: 'preview'; id: number }
	| { kind: 'add-guest' }
	| { kind: 'edit'; id: number }
	| { kind: 'message'; id: number }
	| { kind: 'note'; id: number }
	| { kind: 'delete'; id: number }
	| { kind: 'merge'; id: number }
	| { kind: 'bulk-tag' }
	| { kind: 'bulk-message' }
	| null;

const TODAY = '2026-09-17';
const MS = 86400000;
const STAYS_BUCKETS = ['0', '1', '2-3', '4-5', '6+'];
const TAGS = ['Постійний гість', 'VIP', 'Бізнес', 'Сім’я'];

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS);
const fmt = (iso: string | null) =>
	iso ? new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '';

const SEED_GUESTS: Guest[] = [
	{ id: 1, name: 'Анна Коваленко', phone: '+380 67 123 45 67', email: 'anna@example.com', tags: ['Постійний гість'], stays: 4, nights: 12, spent: 28400, lastVisit: '2026-08-20', nextBooking: '2026-09-17', room: '204 · Люкс', staying: false, prefs: ['Тихий номер', 'Пізній check-in'] },
	{ id: 2, name: 'Олег Бондар', phone: '+380 50 222 11 33', email: '', tags: [], stays: 1, nights: 2, spent: 3200, lastVisit: '2026-07-12', nextBooking: null, room: null, staying: false, prefs: [] },
	{ id: 3, name: 'Марія Петренко', phone: '+380 63 456 78 90', email: 'maria@example.com', tags: ['VIP'], stays: 8, nights: 31, spent: 74800, lastVisit: '2026-09-01', nextBooking: '2026-10-05', room: '202 · Люкс', staying: false, prefs: ['Високий поверх'] },
	{ id: 4, name: 'Ірина Шевченко', phone: '+380 97 654 32 10', email: '', tags: ['Сім’я'], stays: 2, nights: 5, spent: 9200, lastVisit: '2025-12-20', nextBooking: null, room: null, staying: false, prefs: ['Дитяче ліжечко'] },
	{ id: 5, name: 'Дмитро Левченко', phone: '+380 66 111 22 33', email: '', tags: [], stays: 0, nights: 0, spent: 0, lastVisit: null, nextBooking: '2026-09-25', room: '106 · Покращений', staying: false, prefs: [] },
	{ id: 6, name: 'Олена Романюк', phone: '+380 68 222 33 44', email: '', tags: ['Постійний гість'], stays: 3, nights: 7, spent: 15400, lastVisit: '2026-09-16', nextBooking: null, room: '101', staying: true, prefs: ['Тихий номер'] },
	{ id: 7, name: 'Максим Ткаченко', phone: '+380 63 333 44 55', email: '', tags: [], stays: 1, nights: 3, spent: 6600, lastVisit: '2026-06-10', nextBooking: null, room: null, staying: false, prefs: [] },
	{ id: 8, name: 'Наталія Коваль', phone: '+380 97 555 66 77', email: 'natalia@example.com', tags: ['Постійний гість', 'Бізнес'], stays: 5, nights: 14, spent: 31200, lastVisit: '2026-08-25', nextBooking: '2026-11-02', room: '203 · Люкс', staying: false, prefs: ['Ранній заїзд'] },
	{ id: 9, name: 'Андрій Мельник', phone: '+380 50 444 55 66', email: '', tags: [], stays: 2, nights: 4, spent: 8000, lastVisit: '2026-03-01', nextBooking: null, room: null, staying: false, prefs: [] },
	{ id: 10, name: 'Тарас Гончар', phone: '+380 66 777 88 99', email: '', tags: [], stays: 1, nights: 1, spent: 1600, lastVisit: '2026-09-10', nextBooking: null, room: null, staying: false, prefs: [] },
];

function isRegular(g: Guest): boolean {
	return g.stays >= 2;
}

function isAway(g: Guest): boolean {
	return g.stays >= 2 && !!g.lastVisit && dayDiff(g.lastVisit, TODAY) > 180 && !g.nextBooking;
}

function statusOf(g: Guest): { key: string; label: string } {
	if (g.staying) return { key: 'staying', label: 'У готелі' };
	if (g.nextBooking === TODAY) return { key: 'today', label: 'Приїжджає сьогодні' };
	if (g.nextBooking) return { key: g.stays > 0 ? 'upcoming' : 'new', label: g.stays > 0 ? 'Має бронювання' : 'Новий гість' };
	if (g.stays > 0) return { key: 'former', label: 'Колишній гість' };
	return { key: 'new', label: 'Новий гість' };
}

function staysBucket(n: number): string {
	return n === 0 ? '0' : n <= 1 ? '1' : n <= 3 ? '2-3' : n <= 5 ? '4-5' : '6+';
}

@Component({
	selector: 'app-guests',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './guests.component.html',
	styleUrl: './guests.component.scss',
})
export class GuestsComponent {
	/** Guest export, merge and deletion are separate capabilities (Owner/Manager by default). */
	protected readonly canBulk = canCurrent('guestBulk');

	protected readonly TAGS = TAGS;
	protected readonly STAYS_BUCKETS = STAYS_BUCKETS;
	protected readonly money = money;
	protected readonly fmt = fmt;
	protected readonly statusOf = statusOf;

	protected readonly guests = signal<Guest[]>(SEED_GUESTS.map((g) => ({ ...g, tags: [...g.tags], prefs: [...g.prefs] })));
	protected readonly search = signal('');
	protected readonly segment = signal<Segment>('all');
	protected readonly sort = signal<Sort>('activity');
	protected readonly selected = signal<Set<number>>(new Set());
	protected readonly staysFilter = signal(new Set(STAYS_BUCKETS));
	protected readonly tagsFilter = signal(new Set(TAGS));
	protected readonly filtersOpen = signal(false);
	protected readonly openRowMenuId = signal<number | null>(null);

	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly aiAnswerHtml = signal('');
	protected readonly addGuestPhone = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	protected readonly repeatCount = computed(() => this.guests().filter(isRegular).length);

	protected readonly filteredGuests = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		let list = this.guests().filter((g) => this.passesFilters(g));
		if (q) list = list.filter((g) => (g.name + ' ' + g.phone + ' ' + g.email).toLocaleLowerCase('uk-UA').includes(q));
		const seg = this.segment();
		if (seg === 'staying') list = list.filter((g) => g.staying);
		else if (seg === 'upcoming') list = list.filter((g) => !!g.nextBooking);
		else if (seg === 'regular') list = list.filter(isRegular);
		else if (seg === 'new') list = list.filter((g) => g.stays === 0);
		else if (seg === 'away') list = list.filter(isAway);

		const sorters: Record<Sort, (a: Guest, b: Guest) => number> = {
			activity: (a, b) => +new Date(b.nextBooking || b.lastVisit || 0) - +new Date(a.nextBooking || a.lastVisit || 0),
			name: (a, b) => a.name.localeCompare(b.name, 'uk'),
			stays: (a, b) => b.stays - a.stays,
			spent: (a, b) => b.spent - a.spent,
			visit: (a, b) => +new Date(b.lastVisit || 0) - +new Date(a.lastVisit || 0),
		};
		return list.slice().sort(sorters[this.sort()]);
	});

	protected readonly allSelectedOnPage = computed(() => {
		const list = this.filteredGuests();
		return list.length > 0 && list.every((g) => this.selected().has(g.id));
	});

	protected readonly duplicateGuest = computed(() => {
		const v = this.addGuestPhone().replace(/\s/g, '');
		if (v.length <= 6) return undefined;
		return this.guests().find((g) => g.phone.replace(/\s/g, '') === v);
	});

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

	private passesFilters(g: Guest): boolean {
		if (!this.staysFilter().has(staysBucket(g.stays))) return false;
		if (g.tags.length && !g.tags.some((t) => this.tagsFilter().has(t))) return false;
		return true;
	}

	protected guest(id: number): Guest | undefined {
		return this.guests().find((g) => g.id === id);
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected setSegment(seg: Segment): void {
		this.segment.set(seg);
	}

	protected setSort(value: string): void {
		this.sort.set(value as Sort);
	}

	protected onSearch(value: string): void {
		this.search.set(value);
	}

	protected toggleFilters(): void {
		this.filtersOpen.update((v) => !v);
	}

	protected toggleStaysFilter(value: string, checked: boolean): void {
		this.staysFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(value) : next.delete(value);
			return next;
		});
	}

	protected toggleTagFilter(value: string, checked: boolean): void {
		this.tagsFilter.update((set) => {
			const next = new Set(set);
			checked ? next.add(value) : next.delete(value);
			return next;
		});
	}

	protected clearFilters(): void {
		this.staysFilter.set(new Set(STAYS_BUCKETS));
		this.tagsFilter.set(new Set(TAGS));
	}

	protected applyFilters(): void {
		this.filtersOpen.set(false);
	}

	protected toggleSelectAll(checked: boolean): void {
		this.selected.update((set) => {
			const next = new Set(set);
			for (const g of this.filteredGuests()) checked ? next.add(g.id) : next.delete(g.id);
			return next;
		});
	}

	protected toggleSelectGuest(id: number, checked: boolean): void {
		this.selected.update((set) => {
			const next = new Set(set);
			checked ? next.add(id) : next.delete(id);
			return next;
		});
	}

	protected toggleRowMenu(id: number, event: Event): void {
		event.stopPropagation();
		this.openRowMenuId.update((cur) => (cur === id ? null : id));
	}

	protected closeRowMenu(): void {
		this.openRowMenuId.set(null);
	}

	protected openPreview(g: Guest): void {
		this.dialogView.set({ kind: 'preview', id: g.id });
	}

	protected openProfile(id: number): void {
		this.closeDialog();
		if (id === 1) {
			window.location.href = '/guest/';
		} else {
			this.toast('Профіль ще у розробці для цього демо-гостя');
		}
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

	protected openAddGuest(): void {
		this.addGuestPhone.set('');
		this.dialogView.set({ kind: 'add-guest' });
	}

	protected submitAddGuest(first: string, last: string, phone: string, email: string, _note: string): void {
		const name = (first + ' ' + (last || '').trim()).trim();
		const id = Math.max(...this.guests().map((g) => g.id)) + 1;
		this.guests.update((gs) => [
			{ id, name, phone, email, tags: [], stays: 0, nights: 0, spent: 0, lastVisit: null, nextBooking: null, room: null, staying: false, prefs: [] },
			...gs,
		]);
		this.closeDialog();
		this.toast('Гостя додано');
	}

	protected openMessage(id: number): void {
		this.dialogView.set({ kind: 'message', id });
	}

	protected submitMessage(): void {
		this.closeDialog();
		this.toast('Повідомлення надіслано · Демо');
	}

	protected openNote(id: number): void {
		this.dialogView.set({ kind: 'note', id });
	}

	protected submitNote(): void {
		this.closeDialog();
		this.toast('Нотатку збережено');
	}

	protected openEdit(id: number): void {
		this.dialogView.set({ kind: 'edit', id });
	}

	protected submitEdit(id: number, name: string, phone: string, email: string): void {
		this.guests.update((gs) => gs.map((g) => (g.id === id ? { ...g, name, phone, email } : g)));
		this.closeDialog();
		this.toast('Зміни збережено');
	}

	protected openMerge(id: number): void {
		if (!this.canBulk) return;
		this.dialogView.set({ kind: 'merge', id });
	}

	protected openDelete(id: number): void {
		if (!this.canBulk) return;
		this.dialogView.set({ kind: 'delete', id });
	}

	protected archiveGuest(): void {
		this.closeDialog();
		this.toast('Гостя архівовано · Демо');
	}

	protected forceDelete(id: number): void {
		if (!this.canBulk) return;
		this.guests.update((gs) => gs.filter((g) => g.id !== id));
		this.selected.update((set) => {
			const next = new Set(set);
			next.delete(id);
			return next;
		});
		this.closeDialog();
		this.toast('Гостя видалено · Демо');
	}

	protected useExisting(id: number): void {
		this.openProfile(id);
	}

	protected createAnyway(): void {
		this.toast('Продовжуйте заповнення форми');
	}

	protected exportGuests(): void {
		if (!this.canBulk) return;
		this.toast('Експорт CRM · Демо');
	}

	protected openBulkTag(): void {
		this.dialogView.set({ kind: 'bulk-tag' });
	}

	protected submitBulkTag(tag: string): void {
		this.guests.update((gs) =>
			gs.map((g) => (this.selected().has(g.id) && !g.tags.includes(tag) ? { ...g, tags: [...g.tags, tag] } : g)),
		);
		this.closeDialog();
		this.toast('Тег додано вибраним гостям');
	}

	protected openBulkMessage(): void {
		this.dialogView.set({ kind: 'bulk-message' });
	}

	protected bulkExport(): void {
		if (!this.canBulk) return;
		this.toast('Обраних гостей експортовано · Демо');
	}

	protected aiAnswer(key: string): void {
		const list = this.guests();
		const byStays = [...list].sort((a, b) => b.stays - a.stays)[0];
		const bySpend = [...list].sort((a, b) => b.spent - a.spent)[0];
		const away = list.filter(isAway);
		const thisWeek = list.filter((g) => g.nextBooking && dayDiff(TODAY, g.nextBooking) >= 0 && dayDiff(TODAY, g.nextBooking) <= 7);
		const map: Record<string, string> = {
			returning: `<p>Найчастіше повертається <b>${byStays.name}</b>, ${byStays.stays} проживання.</p>`,
			topspend: `<p>Найбільше витратила <b>${bySpend.name}</b>, ${money(bySpend.spent)}.</p>`,
			away: away.length
				? `<p>${away.map((g) => g.name).join(', ')} не були у нас понад 6 місяців.</p>`
				: '<p>Усі активні гості поверталися протягом останніх 6 місяців.</p>',
			week: thisWeek.length
				? `<p>${thisWeek.map((g) => `${g.name}, ${fmt(g.nextBooking)}`).join('<br>')}</p>`
				: '<p>На цьому тижні бронювань не заплановано.</p>',
			newcount: `<p>Цього місяця <b>86 нових гостей</b>, +14% до минулого місяця.</p>`,
		};
		this.aiAnswerHtml.set(map[key] ?? '<p>AI відповідає лише на основі даних CRM.</p>');
	}
}
