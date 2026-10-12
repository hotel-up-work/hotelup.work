import { isPlatformBrowser } from '@angular/common';
import {
	AfterViewInit,
	Component,
	DestroyRef,
	ElementRef,
	inject,
	PLATFORM_ID,
	signal,
	viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

type CaseKey = 'overbooking' | 'money' | 'blackout' | 'staff' | 'remote';

interface PitchCase {
	key: CaseKey;
	/** Short name for the agenda and the slide counter. */
	short: string;
	title: string;
	situation: string;
	cost: string;
	/** Solution headline, the answer to `title`. */
	fix: string;
	solution: string[];
}

const CASES: PitchCase[] = [
	{
		key: 'overbooking',
		short: 'Овербукінг',
		title: 'Двоє гостей з підтвердженням на один номер',
		situation:
			'Дзвінок записали в зошит, заявку з Instagram підтвердив менеджер, ще одна прийшла з сайту на пошту. Кожен бачив, що 204-й вільний.',
		cost: 'Повернення передоплати, номер у сусідів за ваш кошт і поганий відгук.',
		fix: 'Один календар для всієї команди і всіх джерел',
		solution: [
			'Бронювання з рецепції одразу бачать усі, з будь-якого пристрою.',
			'Заявки з ваших сайтів потрапляють у «Заявки», а не в пошту.',
			'Перед підтвердженням видно, чи вільний саме цей номер.',
		],
	},
	{
		key: 'money',
		short: 'Загублені оплати',
		title: 'Передоплата прийшла. Куди саме, ніхто не знає',
		situation:
			'Хтось переказав на картку адміністратора, хтось заплатив готівкою, хтось «скине завтра». Щоб закрити місяць, власник гортає Viber, банк і зошит.',
		cost: 'Недоотримані залишки, гроші повз касу і невідомий реальний дохід.',
		fix: 'Кожна гривня записана до конкретного бронювання',
		solution: [
			'Сума, спосіб, дата і хто прийняв оплату.',
			'Записи не можна змінити чи видалити, лише виправити новим.',
			'Усі неоплачені залишки в одному списку.',
		],
	},
	{
		key: 'blackout',
		short: 'Блекаут',
		title: 'Світло зникло, а з ним і таблиця бронювань',
		situation:
			'Ноутбук на рецепції сів, Excel лишився на ньому. Гість питає про номер на суботу, адміністратор обіцяє передзвонити, і гість бронює деінде.',
		cost: 'Втрачені бронювання і ризик втратити весь файл разом із диском.',
		fix: 'Готель у хмарі, рецепція в телефоні',
		solution: [
			'Дані зберігаються в хмарі, а не на комп’ютері рецепції.',
			'Календар і оплати відкриваються з телефона через мобільний інтернет.',
			'Нічого не треба встановлювати, працює в браузері.',
		],
	},
	{
		key: 'staff',
		short: 'Звільнення адміністратора',
		title: 'Адміністратор звільнився і забрав базу гостей',
		situation:
			'Контакти постійних гостей у його телефоні, листування в його Viber, домовленості в його голові. Новий працівник починає з нуля.',
		cost: 'Постійні гості бронюють там, де їх пам’ятають.',
		fix: 'База гостей належить готелю, а не працівнику',
		solution: [
			'Контакти, історія проживань і нотатки в картці гостя.',
			'Кожен працівник має свій вхід і роль.',
			'Людина пішла: вимикаєте доступ, історія лишається.',
		],
	},
	{
		key: 'remote',
		short: 'Контроль на відстані',
		title: 'Власник далеко, а готель працює щодня',
		situation:
			'Ви за кордоном, в іншому місті чи на службі. Щоб дізнатися про заїзди й борги, доводиться дзвонити адміністратору і вірити на слово.',
		cost: 'Рішення без цифр і залежність від однієї людини.',
		fix: 'Увесь день готелю на екрані телефона',
		solution: [
			'Заїзди, виїзди, завантаження і хто винен гроші.',
			'Ті самі дані, що й у рецепції, одразу після запису.',
			'Видно, хто створив бронювання і прийняв оплату.',
		],
	},
];

@Component({
	selector: 'app-pitch',
	imports: [RouterLink],
	templateUrl: './pitch.component.html',
	styleUrl: './pitch.component.scss',
	host: {
		'(document:keydown)': 'onKey($event)',
	},
})
export class PitchComponent implements AfterViewInit {
	private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _destroyRef = inject(DestroyRef);

	private readonly _slides = viewChildren<ElementRef<HTMLElement>>('slide');

	protected readonly cases = CASES;
	/** Cover + cases + closing slide. */
	protected readonly total = CASES.length + 2;
	protected readonly slideIndexes = Array.from({ length: this.total }, (_, i) => i);
	protected readonly active = signal(0);

	ngAfterViewInit(): void {
		if (!this._isBrowser || typeof IntersectionObserver === 'undefined') return;

		// The slide crossing the middle of the viewport is the current one, so tall slides on phones still count.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const index = this._slides().findIndex((s) => s.nativeElement === entry.target);
					if (index >= 0) this.active.set(index);
				}
			},
			{ root: this._host.nativeElement, rootMargin: '-50% 0px -50% 0px' },
		);
		for (const slide of this._slides()) observer.observe(slide.nativeElement);
		this._destroyRef.onDestroy(() => observer.disconnect());
	}

	protected go(index: number): void {
		const slide = this._slides()[Math.max(0, Math.min(index, this.total - 1))];
		if (!slide) return;
		const reduce = this._isBrowser && matchMedia('(prefers-reduced-motion: reduce)').matches;
		slide.nativeElement.scrollIntoView({
			behavior: reduce ? 'auto' : 'smooth',
			block: 'start',
		});
	}

	protected onKey(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		const target = event.target as HTMLElement | null;
		// Space and Enter belong to the focused button or link.
		if ((event.key === ' ' || event.key === 'Enter') && target?.closest('a, button')) return;

		const current = this.active();
		let next: number | null = null;
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
			case 'PageDown':
			case ' ':
				next = event.shiftKey && event.key === ' ' ? current - 1 : current + 1;
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
			case 'PageUp':
				next = current - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = this.total - 1;
				break;
		}
		if (next === null) return;
		event.preventDefault();
		this.go(next);
	}

	protected pad(n: number): string {
		return String(n).padStart(2, '0');
	}
}
