import { DOCUMENT } from '@angular/common';
import { Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../feature/firebase/auth.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { getStoredPlan, planForPage, planIncludes, PLANS } from '../../shared/plan';
import {
	clearDemoRole,
	clearRealRole,
	defaultPageFor,
	getSessionRole,
	isLiveSession,
	isPageAllowed,
	isPageAvailable,
	LIVE_PAGES,
	PAGE_LABEL,
	ROLE_LABEL,
} from '../../shared/role';

interface NavItem {
	key: string;
	href: string;
	icon: string;
	label: string;
	badge?: number;
	/** Plan name to unlock the page, set when the role may open it but the hotel's plan does not include it. */
	lockedPlan?: string;
}

const NAV_ITEMS: NavItem[] = [
	{ key: 'overview', href: '/dashboard', icon: 'overview', label: 'Огляд' },
	{ key: 'calendar', href: '/calendar', icon: 'calendar', label: 'Календар' },
	{ key: 'submissions', href: '/submissions', icon: 'send', label: 'Заявки' },
	{ key: 'guests', href: '/guests', icon: 'guests', label: 'Гості' },
	{ key: 'rooms', href: '/rooms', icon: 'hotel', label: 'Номери' },
	{ key: 'payments', href: '/payments', icon: 'wallet', label: 'Оплати' },
	{ key: 'housekeeping', href: '/housekeeping', icon: 'clean', label: 'Прибирання' },
	{ key: 'messages', href: '/messages', icon: 'message', label: 'Повідомлення' },
	{ key: 'automations', href: '/automations', icon: 'automation', label: 'Автоматизації' },
	{ key: 'sales', href: '/sales', icon: 'chart', label: 'Продажі' },
	{ key: 'ai', href: '/ai', icon: 'spark', label: 'AI-помічник' },
];

const THEME_KEY = 'hotelup_theme';

/** Above this many hotels the switcher gets a search field. */
const HOTEL_SEARCH_MIN = 6;

@Component({
	selector: 'app-shell',
	imports: [IconComponent, RouterLink],
	templateUrl: './app-shell.component.html',
	styleUrl: './app-shell.component.scss',
	host: {
		'(document:click)': 'onDocumentClick($event)',
		'(document:keydown.escape)': 'closeHotelMenu(true)',
	},
})
export class AppShellComponent {
	private readonly _document = inject(DOCUMENT);
	private readonly _router = inject(Router);
	private readonly _auth = inject(AuthService);
	private readonly _hotel = inject(HotelService);

	readonly activeNav = input<string>('');
	readonly housekeepingBadge = input<number | null>(null);
	readonly greetingTitle = input('Добрий день, Олександре');
	readonly greetingSubtitle = input('Grand Hotel · Кам’янець-Подільський');

	protected readonly role = signal(getSessionRole());
	/** Real account: only LIVE_PAGES and no demo-only chrome (search, notifications, profile, plan). */
	protected readonly live = isLiveSession();
	protected readonly roleLabel = computed(() => {
		const role = this.role();
		return role ? ROLE_LABEL[role] : '';
	});

	/** Hotels of the signed-in account (empty in the demo, which shows one static demo hotel). */
	protected readonly hotels = this._hotel.hotels;
	protected readonly activeHotel = this._hotel.activeHotel;
	protected readonly hotelMenuOpen = signal(false);
	protected readonly hotelQuery = signal('');
	protected readonly showHotelSearch = computed(() => this.hotels().length > HOTEL_SEARCH_MIN);
	protected readonly filteredHotels = computed(() => {
		const q = this.hotelQuery().trim().toLowerCase();
		if (!q) return this.hotels();
		return this.hotels().filter((hotel) => `${hotel.name} ${hotel.city}`.toLowerCase().includes(q));
	});

	private readonly _hotelSwitcher = viewChild<ElementRef<HTMLElement>>('hotelSwitcher');
	private readonly _hotelTrigger = viewChild<ElementRef<HTMLButtonElement>>('hotelTrigger');

	protected readonly plan = signal(getStoredPlan());
	protected readonly planName = computed(() => PLANS[this.plan()].name);

	/** Role-allowed pages; plan-locked ones stay visible with the plan that unlocks them (CRM.md → Plans). */
	protected readonly navItems = computed<NavItem[]>(() => {
		const role = this.role();
		const plan = this.plan();
		if (this.live) return NAV_ITEMS.filter((item) => LIVE_PAGES.includes(item.href.slice(1)));
		if (!role) return NAV_ITEMS;
		return NAV_ITEMS.filter((item) => isPageAllowed(role, item.href.slice(1))).map((item) => {
			const path = item.href.slice(1);
			if (planIncludes(plan, path)) return item;
			const needed = planForPage(path);
			return { ...item, lockedPlan: needed ? PLANS[needed].name : '' };
		});
	});

	protected readonly deniedNotice = signal(this._readDeniedNotice());

	protected readonly mobileNavItems = computed(() => this.navItems().filter((item) => !item.lockedPlan).slice(0, 3));

	protected readonly showTeam = computed(() => this._available('team'));
	protected readonly showSettings = computed(() => this._available('settings'));
	protected readonly showAi = computed(() => this._available('ai'));

	private _available(path: string): boolean {
		if (this.live) return LIVE_PAGES.includes(path);
		const role = this.role();
		return !role || isPageAvailable(role, this.plan(), path);
	}

	protected readonly sidebarOpen = signal(false);
	protected readonly isDark = signal(this._readInitialTheme() === 'dark');

	protected toggleSidebar(): void {
		this.sidebarOpen.update((open) => !open);
	}

	protected closeSidebar(): void {
		this.sidebarOpen.set(false);
	}

	protected toggleHotelMenu(): void {
		this.hotelQuery.set('');
		this.hotelMenuOpen.update((open) => !open);
	}

	protected closeHotelMenu(restoreFocus = false): void {
		if (!this.hotelMenuOpen()) return;
		this.hotelMenuOpen.set(false);
		if (restoreFocus) this._hotelTrigger()?.nativeElement.focus();
	}

	protected selectHotel(hotelId: string): void {
		this._hotel.select(hotelId);
		this.closeHotelMenu(true);
		this.closeSidebar();
	}

	protected onDocumentClick(event: MouseEvent): void {
		const switcher = this._hotelSwitcher()?.nativeElement;
		if (switcher && !switcher.contains(event.target as Node)) this.closeHotelMenu();
	}

	protected dismissDenied(): void {
		this.deniedNotice.set(null);
		this._router.navigate([], {
			queryParams: { denied: null, missing: null, locked: null, soon: null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		});
	}

	private _readDeniedNotice(): { text: string; homeLabel: string; home: string; pricing: boolean } | null {
		const params = this._router.parseUrl(this._router.url).queryParams;
		const role = this.role();
		const home = !role ? null : this.live ? LIVE_PAGES[0] : defaultPageFor(role, this.plan());
		if (!role || !home || (!params['denied'] && !params['missing'] && !params['locked'] && !params['soon'])) return null;
		const page = (key: string) => PAGE_LABEL[key] ?? key;
		let text: string;
		if (params['soon']) {
			text = `Розділ «${page(params['soon'])}» ще не підключено до реальних даних вашого готелю. Поки що працюють заявки з сайтів, календар і номери.`;
		} else if (params['locked']) {
			const needed = planForPage(params['locked']);
			text = `Розділ «${page(params['locked'])}» входить у тариф ${needed ? PLANS[needed].name : 'вищого рівня'}. Ваш готель зараз на тарифі ${this.planName()}.`;
		} else if (params['denied']) {
			text = `Розділ «${page(params['denied'])}» недоступний для ролі «${ROLE_LABEL[role]}». Якщо він потрібен для роботи, зверніться до власника або менеджера.`;
		} else {
			text = `Сторінка «${params['missing']}» ще не доступна в демо.`;
		}
		return { text, home: '/' + home, homeLabel: page(home), pricing: !!params['locked'] };
	}

	protected async logout(): Promise<void> {
		clearDemoRole();
		// A real session must also drop the Firebase user and its cached hotels, so the next
		// person on this device doesn't see the previous account's hotel list.
		clearRealRole();
		this._hotel.clear();
		await this._auth.logout();
		this._router.navigateByUrl('/login');
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
