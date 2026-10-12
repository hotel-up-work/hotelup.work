import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { HotelService } from '../../feature/firebase/hotel.service';
import { Gender, SubmissionsService } from '../../feature/firebase/submissions.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent, isLiveSession } from '../../shared/role';

type Status = 'new' | 'inProgress' | 'booked' | 'closed' | 'spam';

interface HistoryEntry {
	time: string;
	text: string;
}

interface Submission {
	id: string;
	received: string;
	name: string;
	phone: string;
	email: string;
	/** Stable form slug from the site; `form` is its display label. */
	formId: string;
	/** Page the form was sent from (origin + path), empty for older submissions. */
	site?: string;
	form: string;
	checkIn?: string;
	checkOut?: string;
	guests?: number;
	roomType?: string;
	/** Service requests: the day, optional time and chosen option. */
	date?: string;
	time?: string;
	service?: string;
	/** Hostels: one entry per guest. */
	genders?: Gender[];
	message: string;
	status: Status;
	history: HistoryEntry[];
}

interface ConnectedSite {
	domain: string;
	forms: string;
	last: string;
}

type DialogView = { kind: 'connect' } | { kind: 'close'; id: string } | null;

const STATUS_LABEL: Record<Status, string> = {
	new: 'Нова',
	inProgress: 'В роботі',
	booked: 'Бронювання створено',
	closed: 'Закрита',
	spam: 'Спам',
};

const TABS: { key: Status | 'all'; label: string }[] = [
	{ key: 'all', label: 'Усі' },
	{ key: 'new', label: 'Нові' },
	{ key: 'inProgress', label: 'В роботі' },
	{ key: 'booked', label: 'Бронювання' },
	{ key: 'closed', label: 'Закриті' },
	{ key: 'spam', label: 'Спам' },
];

const SITES: ConnectedSite[] = [
	{ domain: 'grandhotel.ua', forms: 'Бронювання, зворотний дзвінок, запитання', last: 'Сьогодні, 11:42' },
	{ domain: 'grandhotel-events.com', forms: 'Групове бронювання', last: 'Вчора, 16:05' },
];

const SEED: Submission[] = [
	{
		id: '318',
		received: '2026-09-17T11:42',
		name: 'Марія Коваль',
		phone: '+380 67 450 12 90',
		email: 'maria.koval@example.com',
		form: 'Бронювання',
		formId: 'booking',
		checkIn: '2026-10-03',
		checkOut: '2026-10-05',
		guests: 2,
		roomType: 'Покращений',
		message: 'Хочемо номер з видом на фортецю, якщо можливо. Приїдемо ввечері, близько 20:00.',
		status: 'new',
		history: [{ time: '17.09, 11:42', text: 'Заявка надійшла з форми «Бронювання» на grandhotel.ua' }],
	},
	{
		id: '317',
		received: '2026-09-17T10:15',
		name: 'Андрій Мельник',
		phone: '+380 93 218 77 04',
		email: '',
		form: 'Зворотний дзвінок',
		formId: 'callback',
		message: 'Передзвоніть, будь ласка, щодо умов проживання з собакою.',
		status: 'new',
		history: [{ time: '17.09, 10:15', text: 'Заявка надійшла з форми «Зворотний дзвінок» на grandhotel.ua' }],
	},
	{
		id: '316',
		received: '2026-09-17T08:03',
		name: 'Olivia Brown',
		phone: '+44 7700 900 312',
		email: 'olivia.brown@example.com',
		form: 'Запитання',
		formId: 'question',
		message: 'Is there a parking spot for a camper van? We plan to stay one night next week.',
		status: 'new',
		history: [{ time: '17.09, 08:03', text: 'Заявка надійшла з форми «Запитання» на grandhotel.ua' }],
	},
	{
		id: '315',
		received: '2026-09-16T16:05',
		name: 'ТОВ «Поділля Тревел»',
		phone: '+380 50 611 20 45',
		email: 'events@podillia-travel.example.com',
		form: 'Групове бронювання',
		formId: 'group-booking',
		checkIn: '2026-10-24',
		checkOut: '2026-10-26',
		guests: 18,
		roomType: 'Стандарт',
		message: 'Група 18 осіб, 9 номерів. Потрібен сніданок і зал на 2 години в суботу.',
		status: 'inProgress',
		history: [
			{ time: '16.09, 16:05', text: 'Заявка надійшла з форми «Групове бронювання» на grandhotel-events.com' },
			{ time: '16.09, 16:40', text: 'Олена Бондар взяла заявку в роботу' },
			{ time: '16.09, 17:10', text: 'Надіслано пропозицію на email, чекаємо відповідь до 19.09' },
		],
	},
	{
		id: '314',
		received: '2026-09-16T12:30',
		name: 'Ігор Савчук',
		phone: '+380 66 902 33 18',
		email: 'igor.savchuk@example.com',
		form: 'Бронювання',
		formId: 'booking',
		checkIn: '2026-09-26',
		checkOut: '2026-09-28',
		guests: 3,
		roomType: 'Апартаменти',
		message: 'Двоє дорослих і дитина 6 років. Чи є дитяче ліжко?',
		status: 'booked',
		history: [
			{ time: '16.09, 12:30', text: 'Заявка надійшла з форми «Бронювання» на grandhotel.ua' },
			{ time: '16.09, 12:52', text: 'Ірина Петренко зателефонувала гостю' },
			{ time: '16.09, 13:05', text: 'Створено бронювання · номер 301' },
		],
	},
	{
		id: '313',
		received: '2026-09-15T19:48',
		name: 'Наталія Гнатюк',
		phone: '+380 97 115 40 62',
		email: 'n.hnatiuk@example.com',
		form: 'Бронювання',
		formId: 'booking',
		checkIn: '2026-09-19',
		checkOut: '2026-09-20',
		guests: 2,
		roomType: 'Люкс',
		message: 'Святкуємо річницю, чи можна підготувати квіти в номер?',
		status: 'booked',
		history: [
			{ time: '15.09, 19:48', text: 'Заявка надійшла з форми «Бронювання» на grandhotel.ua' },
			{ time: '16.09, 09:10', text: 'Створено бронювання · номер 401' },
		],
	},
	{
		id: '312',
		received: '2026-09-15T14:20',
		name: 'Василь Литвин',
		phone: '+380 68 330 71 25',
		email: '',
		form: 'Бронювання',
		formId: 'booking',
		checkIn: '2026-09-18',
		checkOut: '2026-09-21',
		guests: 2,
		roomType: 'Стандарт',
		message: '',
		status: 'closed',
		history: [
			{ time: '15.09, 14:20', text: 'Заявка надійшла з форми «Бронювання» на grandhotel.ua' },
			{ time: '15.09, 15:02', text: 'Закрито: немає вільних номерів на ці дати' },
		],
	},
	{
		id: '311',
		received: '2026-09-14T03:11',
		name: 'Best SEO Offer',
		phone: '',
		email: 'promo@seo-offer.example.com',
		form: 'Запитання',
		formId: 'question',
		message: 'We can bring your website to the top of Google in 7 days!!!',
		status: 'spam',
		history: [
			{ time: '14.09, 03:11', text: 'Заявка надійшла з форми «Запитання» на grandhotel.ua' },
			{ time: '14.09, 09:00', text: 'Позначено як спам' },
		],
	},
];

const CLOSE_REASONS = ['Немає вільних номерів', 'Гість обрав інший готель', 'Не вдалося зв’язатися', 'Питання вирішено', 'Інше'];

const NOW = '17.09';

/** Ukrainian plural: 1 гість, 2 гості, 5 гостей. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
	return `${n} ${word}`;
}

/** `YYYY-MM-DDTHH:mm` in the browser's time zone (toISOString would give UTC). */
function localIso(date: Date): string {
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

@Component({
	selector: 'app-submissions',
	imports: [AppShellComponent, FormsModule, IconComponent],
	templateUrl: './submissions.component.html',
	styleUrl: './submissions.component.scss',
})
export class SubmissionsComponent {
	private readonly _router = inject(Router);
	private readonly _submissionsService = inject(SubmissionsService);
	private readonly _hotel = inject(HotelService);

	protected readonly TABS = TABS;
	protected readonly SITES = SITES;
	protected readonly STATUS_LABEL = STATUS_LABEL;
	protected readonly CLOSE_REASONS = CLOSE_REASONS;
	protected readonly canManageApi = canCurrent('manageIntegrations');
	/** Real account: hide demo-only parts (connect-site dialog, first-response time). */
	protected readonly live = isLiveSession();

	/** A real, logged-in account sees the active hotel's live leads; a demo session sees this seed data. */
	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return "Grand Hotel · Кам'янець-Подільський";
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	/** Link to the form on the page it was sent from: the <form> id equals its formId (see CRM.md). */
	protected formUrl(s: Submission): string | null {
		return s.site && s.formId ? `${s.site}#${s.formId}` : null;
	}

	protected siteHost(site: string): string {
		try {
			return new URL(site).host;
		} catch {
			return site;
		}
	}

	protected readonly submissions = signal<Submission[]>(this.hotelId() ? [] : SEED);
	protected readonly tab = signal<Status | 'all'>('all');
	protected readonly query = signal('');
	protected readonly formFilter = signal('all');
	protected readonly selectedId = signal<string | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly closeReason = signal(CLOSE_REASONS[0]);
	protected readonly keyVisible = signal(false);
	protected readonly toastMessage = signal('');
	protected readonly loadError = signal('');

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly counts = computed(() => {
		const list = this.submissions();
		const by = (status: Status) => list.filter((s) => s.status === status).length;
		const handled = list.filter((s) => s.status !== 'spam' && s.status !== 'new').length;
		return {
			all: list.length,
			new: by('new'),
			inProgress: by('inProgress'),
			booked: by('booked'),
			closed: by('closed'),
			spam: by('spam'),
			conversion: handled ? Math.round((by('booked') / handled) * 100) : 0,
		};
	});

	/** Forms that actually sent something, for the filter; hidden while there is only one. */
	protected readonly formOptions = computed(() => {
		const forms = new Map<string, string>();
		for (const s of this.submissions()) forms.set(s.formId, s.form);
		return [...forms].map(([id, label]) => ({ id, label }));
	});

	protected readonly visible = computed(() => {
		const tab = this.tab();
		const form = this.formFilter();
		const q = this.query().trim().toLowerCase();
		return this.submissions().filter(
			(s) =>
				(tab === 'all' ? s.status !== 'spam' : s.status === tab) &&
				(form === 'all' || s.formId === form) &&
				(!q || [s.name, s.phone, s.email, s.message].some((v) => v.toLowerCase().includes(q))),
		);
	});

	protected readonly selected = computed(() => this.submissions().find((s) => s.id === this.selectedId()) ?? null);

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

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listener is dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!hotelId) return;
			this.submissions.set([]);
			this.selectedId.set(null);
			this.formFilter.set('all');
			this.loadError.set('');
			const unsubscribe = this._submissionsService.listen(hotelId, (records) => {
				this.loadError.set('');
				this.submissions.set(
					records.map((r) => ({
						id: r.id,
						received: r.receivedAt ? localIso(r.receivedAt) : '',
						name: r.name,
						phone: r.phone,
						email: r.email,
						formId: r.formId,
						site: r.site || undefined,
						form: r.formName || r.formId,
						checkIn: r.checkIn || undefined,
						checkOut: r.checkOut || undefined,
						guests: r.guests ?? undefined,
						roomType: r.roomType || undefined,
						date: r.date || undefined,
						time: r.time || undefined,
						service: r.service || undefined,
						genders: r.genders.length ? r.genders : undefined,
						message: r.message,
						status: r.status,
						history: r.history,
					})),
				);
			}, (error) => {
				// Most often a missing composite index: the console message links to create it.
				console.error('Submissions listener failed', error);
				this.loadError.set('Не вдалося завантажити заявки. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			});
			onCleanup(unsubscribe);
		});
	}

	protected tabCount(key: Status | 'all'): number {
		const c = this.counts();
		return key === 'all' ? c.all - c.spam : c[key];
	}

	protected time(value: string): string {
		if (!value) return '—';
		const [date, rawTime] = value.split('T');
		const time = rawTime.slice(0, 5);
		const [, m, d] = date.split('-');
		const today = this.hotelId() ? localIso(new Date()).slice(0, 10) : '2026-09-17';
		const yesterday = this.hotelId() ? localIso(new Date(Date.now() - 86_400_000)).slice(0, 10) : '2026-09-16';
		return date === today ? `Сьогодні, ${time}` : date === yesterday ? `Вчора, ${time}` : `${d}.${m}, ${time}`;
	}

	protected dates(s: Submission): string {
		if (s.date) return s.date.slice(8, 10) + '.' + s.date.slice(5, 7) + (s.time ? `, ${s.time}` : '');
		if (!s.checkIn || !s.checkOut) return '—';
		const short = (v: string) => v.slice(8, 10) + '.' + v.slice(5, 7);
		const nights = Math.round((Date.parse(s.checkOut) - Date.parse(s.checkIn)) / 86_400_000);
		return `${short(s.checkIn)}–${short(s.checkOut)} · ${plural(nights, 'ніч', 'ночі', 'ночей')}`;
	}

	protected guests(n: number): string {
		return plural(n, 'гість', 'гості', 'гостей');
	}

	/** "2 жін., 1 чол." for hostel requests. */
	protected genderSummary(genders: Gender[] | undefined): string {
		if (!genders?.length) return '';
		const female = genders.filter((g) => g === 'female').length;
		const male = genders.length - female;
		return [female && `${female} жін.`, male && `${male} чол.`].filter(Boolean).join(', ');
	}

	protected bookings(n: number): string {
		return plural(n, 'бронювання', 'бронювання', 'бронювань');
	}

	protected open(id: string): void {
		this.selectedId.set(id);
	}

	protected closePanel(): void {
		this.selectedId.set(null);
	}

	protected async takeIntoWork(s: Submission): Promise<void> {
		if (await this._update(s.id, 'inProgress', 'Взято в роботу')) this.toast(`Заявка №${s.id} в роботі`);
	}

	protected async createBooking(s: Submission): Promise<void> {
		// A real hotel books in the Calendar, which prefills the form from this request and marks it
		// "booked" only once the booking is saved. The demo has no bookings to save, so it marks it here.
		if (this.hotelId()) {
			this._router.navigate(['/calendar'], { queryParams: { submission: s.id } });
			return;
		}
		if (await this._update(s.id, 'booked', 'Створено бронювання з заявки')) this._router.navigateByUrl('/calendar');
	}

	protected async markSpam(s: Submission): Promise<void> {
		if (!(await this._update(s.id, 'spam', 'Позначено як спам'))) return;
		this.selectedId.set(null);
		this.toast(`Заявку №${s.id} перенесено в спам`);
	}

	protected async restore(s: Submission): Promise<void> {
		await this._update(s.id, 'new', 'Повернуто в нові');
	}

	protected askClose(s: Submission): void {
		this.closeReason.set(CLOSE_REASONS[0]);
		this.dialogView.set({ kind: 'close', id: s.id });
	}

	protected async confirmClose(id: string): Promise<void> {
		const saved = await this._update(id, 'closed', `Закрито: ${this.closeReason().toLowerCase()}`);
		this.dialogView.set(null);
		if (saved) this.toast(`Заявку №${id} закрито`);
	}

	protected openConnect(): void {
		this.keyVisible.set(false);
		this.dialogView.set({ kind: 'connect' });
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

	protected copy(label: string): void {
		this.toast(`${label} скопійовано · Демо`);
	}

	protected rotateKey(): void {
		this.toast('Новий API-ключ створено. Старий перестане працювати через 24 години · Демо');
	}

	/** Saves a status change; on failure shows an error toast and returns false. */
	private async _update(id: string, status: Status, note: string): Promise<boolean> {
		if (this.hotelId()) {
			try {
				await this._submissionsService.updateStatus(id, status, note);
				return true;
			} catch (error) {
				console.error('Submission status update failed', error);
				this.toast('Не вдалося змінити статус заявки. Перевірте зʼєднання та спробуйте ще раз.');
				return false;
			}
		}
		const time = `${NOW}, ${new Date().toTimeString().slice(0, 5)}`;
		this.submissions.update((list) =>
			list.map((s) => (s.id === id ? { ...s, status, history: [...s.history, { time, text: note }] } : s)),
		);
		return true;
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
