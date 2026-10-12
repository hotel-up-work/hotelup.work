import { Component, computed, ElementRef, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { getDemoRole, type Role } from '../../shared/role';

type SectionId =
	| 'general'
	| 'contacts'
	| 'stay'
	| 'booking'
	| 'payments'
	| 'rules'
	| 'bookingpage'
	| 'messages'
	| 'automations'
	| 'notifications'
	| 'sources'
	| 'ai'
	| 'security';

interface SectionDef {
	id: SectionId;
	label: string;
}

interface SettingsData {
	name: string;
	shortName: string;
	type: string;
	description: string;
	currency: string;
	language: string;
	timezone: string;
	phone: string;
	email: string;
	altPhone: string;
	website: string;
	instagram: string;
	facebook: string;
	country: string;
	city: string;
	street: string;
	building: string;
	zip: string;
	arrivalInstructions: string;
	checkIn: string;
	checkOut: string;
	receptionFrom: string;
	receptionTo: string;
	lateCheckin: boolean;
	lateCheckinNote: string;
	earlyCheckin: 'none' | 'available' | 'paid';
	lateCheckout: 'none' | 'available' | 'paid';
	minNights: number;
	maxNights: number | '';
	sameDayBooking: boolean;
	sameDayCutoff: string;
	futureDays: number;
	bookingStatus: 'auto' | 'pending';
	roomAssignment: 'auto' | 'manual';
	paymentRule: 'none' | 'fixed' | 'percent' | 'full';
	fixedDeposit: number;
	percentDeposit: number;
	methodCash: boolean;
	methodBank: boolean;
	methodCard: boolean;
	onlineProvider: string | false;
	bankDetails: string;
	cancellationType: 'flexible' | 'nonrefundable' | 'custom';
	cancellationHours: number;
	cancellationCustom: string;
	smoking: string;
	pets: string;
	children: string;
	quietFrom: string;
	quietTo: string;
	extraGuests: string;
	customRules: string;
	bookingPageActive: boolean;
	slug: string;
	bpTitle: string;
	bpDesc: string;
	bpShowDescription: boolean;
	bpShowAmenities: boolean;
	bpShowPhotos: boolean;
	bpShowLocation: boolean;
	bpShowCancellation: boolean;
	bpShowPhone: boolean;
	bpShowEmail: boolean;
	bpShowInstagram: boolean;
	emailSenderName: string;
	replyTo: string;
	defaultChannel: 'email' | 'sms';
	quietHoursOn: boolean;
	quietHoursFrom: string;
	quietHoursTo: string;
	notifyNewBooking: boolean;
	notifyCancellation: boolean;
	notifyPayment: boolean;
	notifyMessage: boolean;
	notifyRoomNotReady: boolean;
	notifyHousekeeping: boolean;
	notifyAutomationError: boolean;
	notifyChannel: 'inapp' | 'email';
	aiEnabled: boolean;
	aiBookings: boolean;
	aiGuests: boolean;
	aiFinance: boolean;
	aiSales: boolean;
	aiMessages: boolean;
	prefix: string;
	nextNumber: number;
	legalName: string;
	legalId: string;
	legalAddress: string;
	legalOpen: boolean;
}

type SettingsKey = keyof SettingsData;

interface SourceItem {
	name: string;
	active: boolean;
}

interface HistoryItem {
	date: string;
	by: string;
	text: string;
}

interface OnboardStep {
	label: string;
	done: boolean;
}

interface KbFile {
	id: number;
	name: string;
	status: 'ready' | 'processing';
	updated: string;
}

type DialogView =
	| { kind: 'unsaved' }
	| { kind: 'add-source' }
	| { kind: 'deactivate-bp' }
	| { kind: 'deactivate-hotel' }
	| null;

const SECTIONS: SectionDef[] = [
	{ id: 'general', label: 'Загальне' },
	{ id: 'contacts', label: 'Контакти та локація' },
	{ id: 'stay', label: 'Заселення та виїзд' },
	{ id: 'booking', label: 'Бронювання' },
	{ id: 'payments', label: 'Оплати' },
	{ id: 'rules', label: 'Правила' },
	{ id: 'bookingpage', label: 'Booking Page' },
	{ id: 'messages', label: 'Повідомлення' },
	{ id: 'automations', label: 'Автоматизації' },
	{ id: 'notifications', label: 'Сповіщення' },
	{ id: 'sources', label: 'Джерела бронювань' },
	{ id: 'ai', label: 'AI' },
	{ id: 'security', label: 'Безпека' },
];
const OWNER_ONLY = new Set<SectionId>(['payments', 'rules', 'ai', 'security']);
const EDITOR_ROLES = new Set<Role>(['owner', 'manager']);

const SEED_SETTINGS: SettingsData = {
	name: 'Grand Hotel',
	shortName: 'Grand',
	type: 'Бутик-готель',
	description: 'Невеликий бутик-готель у центрі Кам’янця-Подільського.',
	currency: 'UAH · ₴',
	language: 'Українська',
	timezone: 'Europe/Kyiv',
	phone: '+380 67 123 45 67',
	email: 'hotel@example.com',
	altPhone: '',
	website: '',
	instagram: '',
	facebook: '',
	country: 'Україна',
	city: 'Кам’янець-Подільський',
	street: 'Старобульварна',
	building: '10',
	zip: '',
	arrivalInstructions:
		'Вхід до готелю знаходиться з боку внутрішнього дворика. Паркінг доступний праворуч від центрального входу.',
	checkIn: '14:00',
	checkOut: '11:00',
	receptionFrom: '08:00',
	receptionTo: '23:00',
	lateCheckin: true,
	lateCheckinNote: 'Для заїзду після 23:00 зв’яжіться з адміністрацією заздалегідь.',
	earlyCheckin: 'available',
	lateCheckout: 'available',
	minNights: 1,
	maxNights: '',
	sameDayBooking: true,
	sameDayCutoff: '20:00',
	futureDays: 365,
	bookingStatus: 'auto',
	roomAssignment: 'manual',
	paymentRule: 'percent',
	fixedDeposit: 1500,
	percentDeposit: 30,
	methodCash: true,
	methodBank: true,
	methodCard: true,
	onlineProvider: false,
	bankDetails: '',
	cancellationType: 'flexible',
	cancellationHours: 48,
	cancellationCustom: '',
	smoking: 'Заборонено',
	pets: 'За попереднім погодженням',
	children: 'Діти будь-якого віку вітаються',
	quietFrom: '22:00',
	quietTo: '08:00',
	extraGuests: 'За додаткову плату, за погодженням з готелем.',
	customRules: 'Ключ-картка повинна бути повернута під час виїзду.',
	bookingPageActive: true,
	slug: 'grand-hotel',
	bpTitle: 'Забронюйте номер напряму',
	bpDesc: 'Оберіть дати та номер, підтвердження займе лише кілька хвилин.',
	bpShowDescription: true,
	bpShowAmenities: true,
	bpShowPhotos: true,
	bpShowLocation: true,
	bpShowCancellation: true,
	bpShowPhone: true,
	bpShowEmail: false,
	bpShowInstagram: false,
	emailSenderName: 'Grand Hotel',
	replyTo: 'hotel@example.com',
	defaultChannel: 'email',
	quietHoursOn: true,
	quietHoursFrom: '22:00',
	quietHoursTo: '08:00',
	notifyNewBooking: true,
	notifyCancellation: true,
	notifyPayment: true,
	notifyMessage: true,
	notifyRoomNotReady: true,
	notifyHousekeeping: false,
	notifyAutomationError: true,
	notifyChannel: 'inapp',
	aiEnabled: true,
	aiBookings: true,
	aiGuests: true,
	aiFinance: true,
	aiSales: true,
	aiMessages: true,
	prefix: 'GH-',
	nextNumber: 1843,
	legalName: '',
	legalId: '',
	legalAddress: '',
	legalOpen: false,
};

const SEED_SOURCES: SourceItem[] = [
	{ name: 'Пряме бронювання', active: true },
	{ name: 'Сайт', active: true },
	{ name: 'Instagram', active: true },
	{ name: 'Google', active: true },
	{ name: 'Facebook', active: true },
	{ name: 'Телефон', active: true },
	{ name: 'Booking.com', active: true },
	{ name: 'Walk-in', active: true },
	{ name: 'Інше', active: true },
];

const HISTORY: HistoryItem[] = [
	{ date: '17 вересня · 15:42', by: 'Олександр', text: 'змінив check-in: 13:00 → 14:00' },
	{ date: '16 вересня · 11:10', by: 'Олександр', text: 'змінив передоплату: 20% → 30%' },
];

const ONBOARDING: OnboardStep[] = [
	{ label: 'Основна інформація', done: true },
	{ label: 'Контакти', done: true },
	{ label: 'Номери', done: true },
	{ label: 'Правила бронювання', done: false },
	{ label: 'Оплати', done: false },
	{ label: 'Booking Page', done: false },
	{ label: 'Автоматизації', done: false },
];

const SEED_KB_FILES: KbFile[] = [
	{ id: 1, name: 'Правила_проживання_2026.pdf', status: 'ready', updated: 'Оновлено 3 вересня · 240 КБ' },
	{ id: 2, name: 'Прайс_номерів.pdf', status: 'ready', updated: 'Оновлено 12 вересня · 96 КБ' },
];

const HASH_TO_SECTION: Record<string, SectionId> = {
	general: 'general',
	appearance: 'general',
	contacts: 'contacts',
	'checkin-checkout': 'stay',
	'booking-rules': 'booking',
	payments: 'payments',
	policies: 'rules',
	'booking-page': 'bookingpage',
	messaging: 'messages',
	automations: 'automations',
	notifications: 'notifications',
	sources: 'sources',
	ai: 'ai',
	'ai-knowledge': 'ai',
	security: 'security',
};

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';

@Component({
	selector: 'app-settings',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './settings.component.html',
	styleUrl: './settings.component.scss',
})
export class SettingsComponent {
	protected readonly SECTIONS = SECTIONS;
	protected readonly HISTORY = HISTORY;
	protected readonly ONBOARDING = ONBOARDING;
	protected readonly money = money;

	protected readonly settings = signal<SettingsData>({ ...SEED_SETTINGS });
	protected readonly sources = signal<SourceItem[]>(SEED_SOURCES.map((s) => ({ ...s })));
	protected readonly kbFiles = signal<KbFile[]>(SEED_KB_FILES.map((f) => ({ ...f })));

	protected readonly section = signal<SectionId>(this._sectionFromHash());
	protected readonly dirty = signal(false);
	protected readonly role = signal<Role>(getDemoRole() ?? 'owner');
	protected readonly pendingSection = signal<SectionId | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly toastMessage = signal('');
	protected readonly newSourceName = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly isReadonly = computed(() => !EDITOR_ROLES.has(this.role()));
	protected readonly onboardDone = computed(() => this.ONBOARDING.filter((o) => o.done).length);

	protected readonly paymentPreview = computed(() => {
		const s = this.settings();
		const total = 5000;
		const required =
			s.paymentRule === 'none'
				? 0
				: s.paymentRule === 'fixed'
					? s.fixedDeposit
					: s.paymentRule === 'percent'
						? Math.round((total * s.percentDeposit) / 100)
						: total;
		return { total, required, remaining: total - required };
	});

	protected readonly cancellationPreview = computed(() => {
		const s = this.settings();
		if (s.cancellationType === 'flexible')
			return `Безкоштовне скасування доступне до ${s.cancellationHours} годин до заїзду. Після цього передоплата не повертається.`;
		if (s.cancellationType === 'nonrefundable') return 'Передоплата не повертається у разі скасування.';
		return s.cancellationCustom || 'Правило ще не вказано.';
	});

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	constructor() {
		const hashId = typeof location !== 'undefined' ? (location.hash || '').slice(1) : '';
		if (HASH_TO_SECTION[hashId]) this.section.set(HASH_TO_SECTION[hashId]);

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

	private _sectionFromHash(): SectionId {
		const hashId = typeof location !== 'undefined' ? (location.hash || '').slice(1) : '';
		return HASH_TO_SECTION[hashId] ?? 'general';
	}

	protected isLocked(id: SectionId): boolean {
		return this.isReadonly() || (OWNER_ONLY.has(id) && this.role() !== 'owner');
	}

	protected get(key: SettingsKey): any {
		return this.settings()[key];
	}

	protected setField(key: SettingsKey, value: unknown): void {
		if (this.isLocked(this.section())) return;
		this.settings.update((s) => ({ ...s, [key]: value }));
		this.markDirty();
	}

	protected toggleSetting(key: SettingsKey): void {
		if (this.isLocked(this.section())) return;
		this.settings.update((s) => ({ ...s, [key]: !s[key] }));
		this.markDirty();
	}

	protected pick(key: SettingsKey, value: unknown): void {
		if (this.isLocked(this.section())) return;
		this.settings.update((s) => ({ ...s, [key]: value }));
		this.markDirty();
	}

	protected toggleSource(index: number): void {
		if (this.isLocked(this.section())) return;
		this.sources.update((list) => list.map((s, i) => (i === index ? { ...s, active: !s.active } : s)));
		this.markDirty();
	}

	protected markDirty(): void {
		if (this.isReadonly()) return;
		this.dirty.set(true);
	}

	protected saveChanges(): void {
		this.dirty.set(false);
		this.toast('Зміни збережено');
	}

	protected goToSection(id: SectionId): void {
		if (this.dirty()) {
			this.pendingSection.set(id);
			this.dialogView.set({ kind: 'unsaved' });
			return;
		}
		this.section.set(id);
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	protected saveAndGo(): void {
		this.dirty.set(false);
		this.closeDialog();
		this.toast('Зміни збережено');
		const id = this.pendingSection();
		if (id) this.goToSection(id);
	}

	protected discardAndGo(): void {
		this.dirty.set(false);
		this.closeDialog();
		const id = this.pendingSection();
		if (id) this.goToSection(id);
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

	protected openAddSource(): void {
		this.newSourceName.set('');
		this.dialogView.set({ kind: 'add-source' });
	}

	protected submitAddSource(): void {
		const trimmed = this.newSourceName().trim();
		if (!trimmed) return;
		this.sources.update((list) => [...list, { name: trimmed, active: true }]);
		this.closeDialog();
		this.markDirty();
		this.toast('Джерело додано');
	}

	protected addLegalDetails(): void {
		this.setField('legalOpen', true);
	}

	protected copyLink(): void {
		if (typeof navigator !== 'undefined') {
			navigator.clipboard?.writeText('https://hotelup.work/' + this.settings().slug).catch(() => {});
		}
		this.toast('Посилання скопійовано');
	}

	protected checkOnMap(): void {
		this.toast('Перевірка на карті ще у розробці в демо');
	}

	protected connectOnlinePayment(): void {
		this.toast('Підключення онлайн-оплати ще у розробці в демо');
	}

	protected uploadDemoFile(): void {
		this.toast('Завантаження файлів ще у розробці в демо');
	}

	protected exportData(): void {
		this.toast('Експорт CSV · Демо');
	}

	protected openDeactivateBp(): void {
		this.dialogView.set({ kind: 'deactivate-bp' });
	}

	protected confirmDeactivateBp(): void {
		this.settings.update((s) => ({ ...s, bookingPageActive: false }));
		this.markDirty();
		this.closeDialog();
		this.toast('Booking Page деактивовано');
	}

	protected openDeactivateHotel(): void {
		this.dialogView.set({ kind: 'deactivate-hotel' });
	}

	protected onKbFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const id = Date.now();
		this.kbFiles.update((list) => [{ id, name: file.name, status: 'processing', updated: 'Індексується…' }, ...list]);
		setTimeout(() => {
			this.kbFiles.update((list) =>
				list.map((f) => (f.id === id ? { ...f, status: 'ready', updated: 'Щойно завантажено' } : f)),
			);
			this.toast('AI проіндексував ' + file.name);
		}, 1200);
		input.value = '';
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
