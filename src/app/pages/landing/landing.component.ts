import { DOCUMENT, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
	AfterViewInit,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	NgZone,
	OnDestroy,
	PLATFORM_ID,
	signal,
	viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SITE_TIERS } from '../../shared/site-tiers';
import { PLAN_ORDER, PLANS, setStoredPlan, type Plan } from '../../shared/plan';

interface ParallaxTarget {
	el: HTMLElement;
	factor: number;
}

type ModalKind = 'calendar' | 'guest' | 'contacts' | 'terms' | null;

type PromptKey = 'today' | 'guests' | 'rooms';

const PROMPT_RESPONSES: Record<PromptKey, { question: string; paragraphs: string[] }> = {
	today: {
		question: 'Що сьогодні важливого?',
		paragraphs: [
			'Сьогодні у вас <b>7 заїздів і 4 виїзди.</b>',
			'Номер <b>204</b> ще потрібно прибрати.',
			'Два бронювання мають неоплачений залишок на загальну суму <b>4 800 ₴.</b>',
			'Перший гість очікується приблизно о <b>13:30.</b>',
		],
	},
	guests: {
		question: 'Хто наші найкращі постійні гості?',
		paragraphs: [
			'<b>18 гостей</b> проживали у вас щонайменше три рази за останні 12 місяців.',
			'Разом вони витратили <b>184 000 ₴.</b>',
		],
	},
	rooms: {
		question: 'Які номери вільні на ці вихідні?',
		paragraphs: [
			'З п’ятниці до неділі доступні номери <b>103, 204 та 205.</b>',
			'Перегляньте календар, щоб обрати номер і перевірити дати.',
		],
	},
};

const THEME_KEY = 'hotelup_theme';

@Component({
	selector: 'app-landing',
	imports: [NgTemplateOutlet, RouterLink],
	templateUrl: './landing.component.html',
	styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit, OnDestroy {
	private readonly _document = inject(DOCUMENT);
	private readonly _hostEl = inject(ElementRef<HTMLElement>);
	private readonly _ngZone = inject(NgZone);
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _router = inject(Router);

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
	protected readonly modalKind = signal<ModalKind>(null);
	protected readonly guestName = signal('');

	/** True once the page has scrolled past a small threshold — drives the header's scrolled state. */
	protected readonly scrolled = signal(false);

	private _parallaxTargets: ParallaxTarget[] = [];
	private _scrollTicking = false;
	private _lastScrolledState = false;
	private readonly _onScroll = (): void => this._queueScrollFrame();

	constructor() {
		effect(() => {
			const dialog = this.dialogRef()?.nativeElement;
			if (!dialog) return;
			if (this.modalKind() !== null) {
				if (!dialog.open) dialog.showModal();
			} else if (dialog.open) {
				dialog.close();
			}
		});
	}

	ngAfterViewInit(): void {
		if (!this._isBrowser) return;

		const host: HTMLElement = this._hostEl.nativeElement;
		// Restrained, scroll-tracked parallax on decorative background layers only — never on text or controls.
		const selectors: { selector: string; factor: number }[] = [
			{ selector: '.hero', factor: 0.18 },
			{ selector: '.ai-section', factor: 0.22 },
			{ selector: '.philosophy', factor: 0.15 },
		];
		const targets: ParallaxTarget[] = [];
		for (const { selector, factor } of selectors) {
			const el = host.querySelector(selector);
			if (el instanceof HTMLElement) targets.push({ el, factor });
		}
		this._parallaxTargets = targets;

		this._ngZone.runOutsideAngular(() => {
			window.addEventListener('scroll', this._onScroll, { passive: true });
		});
		this._queueScrollFrame();
	}

	ngOnDestroy(): void {
		if (!this._isBrowser) return;
		window.removeEventListener('scroll', this._onScroll);
	}

	private _queueScrollFrame(): void {
		if (this._scrollTicking) return;
		this._scrollTicking = true;
		requestAnimationFrame(() => {
			this._scrollTicking = false;
			this._onScrollFrame();
		});
	}

	private _onScrollFrame(): void {
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!reducedMotion) {
			for (const target of this._parallaxTargets) {
				const rect = target.el.getBoundingClientRect();
				// Track scroll 1:1 via the element's own viewport offset (no easing/lag), clamped to stay restrained.
				const raw = rect.top * target.factor;
				const clamped = Math.max(-48, Math.min(48, raw));
				target.el.style.setProperty('--parallax-y', `${clamped.toFixed(2)}px`);
			}
		}

		const isScrolled = window.scrollY > 8;
		if (isScrolled !== this._lastScrolledState) {
			this._lastScrolledState = isScrolled;
			this._ngZone.run(() => this.scrolled.set(isScrolled));
		}
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
		if (!inside) this.closeModal();
	}

	protected readonly selectedPrompt = signal<PromptKey>('today');
	protected readonly promptResponse = computed(() => PROMPT_RESPONSES[this.selectedPrompt()]);

	protected readonly cleanReady = signal(false);

	protected readonly isDark = signal(this._readInitialTheme() === 'dark');

	protected readonly plans = PLAN_ORDER.map((key) => PLANS[key]);
	protected readonly siteTiers = SITE_TIERS;

	protected choosePlan(plan: Plan): void {
		setStoredPlan(plan);
		this._router.navigateByUrl('/demo');
	}

	protected goToApp(): void {
		this._router.navigateByUrl('/demo');
	}

	protected openCalendarModal(): void {
		this.modalKind.set('calendar');
	}

	protected openGuestModal(name: string): void {
		this.guestName.set(name);
		this.modalKind.set('guest');
	}

	protected openContactsModal(): void {
		this.modalKind.set('contacts');
	}

	protected openTermsModal(): void {
		this.modalKind.set('terms');
	}

	protected closeModal(): void {
		this.modalKind.set(null);
	}

	protected selectPrompt(key: PromptKey): void {
		this.selectedPrompt.set(key);
	}

	protected markCleanReady(): void {
		this.cleanReady.set(true);
	}

	protected toggleTheme(): void {
		const next = this.isDark() ? 'light' : 'dark';
		this.isDark.set(next === 'dark');
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore storage errors (private mode, etc.) */
		}
		this._document.documentElement.setAttribute('data-theme', next);
	}

	private _readInitialTheme(): 'dark' | 'light' {
		try {
			const stored = localStorage.getItem(THEME_KEY);
			if (stored === 'dark' || stored === 'light') return stored;
		} catch {
			/* ignore storage errors (private mode, etc.) */
		}
		return 'light';
	}
}
