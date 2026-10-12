import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent } from '../../shared/role';

type Category = 'Direct' | 'OTA' | 'Social' | 'Offline' | 'Other';

interface Source {
	name: string;
	pct: number;
	count: number;
	revenue: number;
	nights: number;
	repeat: number;
	avgStay: number;
	category: Category;
}

interface SourceConfig {
	name: string;
	category: string;
	active: boolean;
}

interface SampleBooking {
	guest: string;
	dates: string;
	room: string;
	total: number;
}

type PanelView = { kind: 'source'; name: string } | null;
type DialogView = { kind: 'manage-sources' } | { kind: 'add-source' } | { kind: 'placeholder'; title: string } | null;

const SOURCES: Source[] = [
	{ name: 'Пряме бронювання', pct: 34, count: 29, revenue: 142000, nights: 84, repeat: 8, avgStay: 3.2, category: 'Direct' },
	{ name: 'Booking.com', pct: 28, count: 24, revenue: 121400, nights: 68, repeat: 3, avgStay: 2.4, category: 'OTA' },
	{ name: 'Instagram', pct: 18, count: 15, revenue: 76200, nights: 41, repeat: 4, avgStay: 3.1, category: 'Social' },
	{ name: 'Google', pct: 12, count: 10, revenue: 52400, nights: 28, repeat: 2, avgStay: 2.9, category: 'Social' },
	{ name: 'Телефон', pct: 5, count: 4, revenue: 22600, nights: 11, repeat: 1, avgStay: 2.8, category: 'Offline' },
	{ name: 'Інше', pct: 3, count: 4, revenue: 14000, nights: 10, repeat: 0, avgStay: 2.5, category: 'Other' },
];

const DIRECT_TREND: [string, number][] = [
	['Квітень', 21],
	['Травень', 24],
	['Червень', 26],
	['Липень', 29],
	['Серпень', 31],
	['Вересень', 34],
];

const RETURN_SOURCES: [string, number][] = [
	['Пряме бронювання', 44],
	['Телефон', 22],
	['Instagram', 17],
	['Google', 11],
	['Інше', 6],
];

const CAMPAIGNS = [
	{ name: 'Instagram Summer Story', count: 8, revenue: 34400 },
	{ name: 'Google Business', count: 12, revenue: 48200 },
];

const DEFAULT_SOURCE_CONFIG: SourceConfig[] = [
	{ name: 'Пряме бронювання', category: 'Direct', active: true },
	{ name: 'Сайт', category: 'Direct', active: true },
	{ name: 'Instagram', category: 'Social', active: true },
	{ name: 'Facebook', category: 'Social', active: true },
	{ name: 'Google', category: 'Social', active: true },
	{ name: 'Телефон', category: 'Offline', active: true },
	{ name: 'Booking.com', category: 'OTA', active: true },
	{ name: 'Walk-in', category: 'Offline', active: true },
	{ name: 'Інше', category: 'Other', active: true },
];

const SAMPLE_BOOKINGS: Record<string, SampleBooking[]> = {
	Instagram: [
		{ guest: 'Анна Коваленко', dates: '17–20 вересня', room: '204 · Люкс', total: 4800 },
		{ guest: 'Олег Бондар', dates: '21–24 вересня', room: '205 · Люкс', total: 5400 },
	],
	'Пряме бронювання': [
		{ guest: 'Марія Петренко', dates: '20–23 вересня', room: '202 · Люкс', total: 7200 },
		{ guest: 'Наталія Коваль', dates: '18–21 вересня', room: '203 · Люкс', total: 5200 },
	],
	'Booking.com': [{ guest: 'Ірина Шевченко', dates: '19–22 вересня', room: '205 · Люкс', total: 6400 }],
	Google: [{ guest: 'Тарас Гончар', dates: '22–23 вересня', room: '101 · Стандарт', total: 2400 }],
	Телефон: [{ guest: 'Дмитро Левченко', dates: '17–20 вересня', room: '112 · Покращений', total: 5800 }],
	Інше: [],
};

const MONTH_BOOKINGS_SEED = [2, 3, 1, 4, 2, 3, 5, 2, 1, 3, 4, 2, 3, 1, 4, 2, 3, 5, 2, 4, 3, 1, 2, 4, 3, 2, 1, 3, 4, 0];

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';

const AI_ANSWERS: Record<string, string> = {
	topSource: `<p>Найбільше бронювань дає <b>${SOURCES[0].name}</b>, ${SOURCES[0].count} бронювань (${SOURCES[0].pct}%).</p>`,
	instagram: `<p>Instagram приніс <b>${money(SOURCES.find((s) => s.name === 'Instagram')!.revenue)}</b> з ${
		SOURCES.find((s) => s.name === 'Instagram')!.count
	} бронювань.</p>`,
	directShare: `<p>Частка прямих бронювань цього місяця: <b>34%</b> (29 бронювань), що на 3 п.п. більше, ніж минулого місяця.</p>`,
	returning: `<p>Повторних гостей цього місяця: <b>18</b> (21% від усіх гостей).</p>`,
	growth: `<p>Найбільше зросли <b>Пряме бронювання</b> (+3 п.п.) та <b>Instagram</b>.</p>`,
};

@Component({
	selector: 'app-sales',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './sales.component.html',
	styleUrl: './sales.component.scss',
})
export class SalesComponent {
	/** Payment/refund reconciliation stays with finance roles; Sales sees aggregate booking value only. */
	protected readonly showReconciliation = canCurrent('financeReports');

	protected readonly SOURCES = SOURCES;
	protected readonly DIRECT_TREND = DIRECT_TREND;
	protected readonly RETURN_SOURCES = RETURN_SOURCES;
	protected readonly CAMPAIGNS = CAMPAIGNS;
	protected readonly money = money;
	protected readonly round = Math.round;
	protected readonly max = Math.max;

	protected readonly totalBookings = SOURCES.reduce((s, x) => s + x.count, 0);
	protected readonly totalRevenue = SOURCES.reduce((s, x) => s + x.revenue, 0);
	protected readonly avgTicket = Math.round(this.totalRevenue / this.totalBookings);

	protected readonly period = signal('month');
	protected readonly compare = signal(false);
	protected readonly monthMetric = signal<'bookings' | 'revenue'>('bookings');
	protected readonly sourceConfig = signal<SourceConfig[]>(DEFAULT_SOURCE_CONFIG.map((s) => ({ ...s })));
	protected readonly panelView = signal<PanelView>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly aiAnswerKey = signal<string | null>(null);
	protected readonly toastMessage = signal('');
	protected readonly addSourceError = signal('');

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	private _toastTimer?: ReturnType<typeof setTimeout>;

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

	protected readonly channelSources = computed(() => SOURCES.filter((s) => s.category !== 'Social'));
	protected readonly discoverySources = computed(() => SOURCES.filter((s) => s.category === 'Social'));
	protected readonly channelTotal = computed(() => this.channelSources().reduce((s, x) => s + x.count, 0));
	protected readonly discoveryTotal = computed(() => this.discoverySources().reduce((s, x) => s + x.count, 0));
	protected readonly revenueMax = computed(() => Math.max(...this.channelSources().map((s) => s.revenue)));
	protected readonly directTrendMax = computed(() => Math.max(...DIRECT_TREND.map((d) => d[1])));

	protected readonly directSource = SOURCES.find((s) => s.name === 'Пряме бронювання')!;
	protected readonly otaSource = SOURCES.find((s) => s.name === 'Booking.com')!;

	protected readonly monthChartData = computed(() =>
		this.monthMetric() === 'bookings'
			? MONTH_BOOKINGS_SEED
			: MONTH_BOOKINGS_SEED.map((v) => v * Math.round(3500 + Math.random() * 2000)),
	);
	protected readonly monthChartMax = computed(() => Math.max(...this.monthChartData(), 1));

	protected readonly panelSource = computed(() => {
		const view = this.panelView();
		if (!view) return null;
		return SOURCES.find((s) => s.name === view.name) ?? null;
	});
	protected readonly panelBookings = computed(() => {
		const view = this.panelView();
		return view ? SAMPLE_BOOKINGS[view.name] ?? [] : [];
	});
	protected readonly aiAnswerHtml = computed(() => {
		const key = this.aiAnswerKey();
		return key ? AI_ANSWERS[key] ?? '<p>AI використовує лише реальні sales, booking та payment дані.</p>' : '';
	});

	protected barPct(count: number, total: number): number {
		return total ? Math.round((count / total) * 100) : 0;
	}

	protected setPeriod(value: string): void {
		this.period.set(value);
		this.toast('Період змінено · Демо');
	}

	protected toggleCompare(): void {
		this.compare.update((v) => !v);
	}

	protected setMonthMetric(metric: 'bookings' | 'revenue'): void {
		this.monthMetric.set(metric);
	}

	protected openSourcePanel(name: string): void {
		this.panelView.set({ kind: 'source', name });
	}

	protected closeSourcePanel(): void {
		this.panelView.set(null);
	}

	protected openManageSources(): void {
		this.dialogView.set({ kind: 'manage-sources' });
	}

	protected openAddSource(): void {
		this.addSourceError.set('');
		this.dialogView.set({ kind: 'add-source' });
	}

	protected openPlaceholder(title: string): void {
		this.dialogView.set({ kind: 'placeholder', title });
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

	protected toggleSourceActive(index: number): void {
		this.sourceConfig.update((list) => list.map((s, i) => (i === index ? { ...s, active: !s.active } : s)));
	}

	protected submitAddSource(name: string, category: string): void {
		const trimmed = name.trim();
		if (!trimmed) {
			this.addSourceError.set("Вкажіть назву джерела.");
			return;
		}
		this.sourceConfig.update((list) => [...list, { name: trimmed, category, active: true }]);
		this.dialogView.set({ kind: 'manage-sources' });
		this.toast('Джерело додано');
	}

	protected askAi(key: string): void {
		this.aiAnswerKey.set(key);
	}

	protected viewBookingsPlaceholder(): void {
		this.toast('Список бронювань за фільтром ще у розробці в демо');
	}

	protected exportData(): void {
		this.toast('Експорт CSV/XLSX · Демо');
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
