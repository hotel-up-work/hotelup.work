import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { buildAbsoluteUrl } from '@wawjs/ngx-default';
import { companyProfile } from './feature/company/company.data';
import { defaultPageFor, getSessionRole, isLiveSession, LIVE_PAGES } from './shared/role';
import { roleGuard, roomsMovedGuard } from './shared/role.guard';

const SETTINGS_META = {
	title: 'Налаштування · Hotel Upwork',
	titleSuffix: '',
	description: 'Hotel Upwork: налаштування готелю, бронювань та інтеграцій.',
	robots: 'noindex, nofollow',
};

export const routes: Routes = [
	{
		path: '',
		data: {
			meta: {
				title: 'Hotel Upwork: Увесь готель в одній простій системі',
				titleSuffix: '',
				description:
					'Hotel Upwork: бронювання, гості, оплати, прибирання та комунікація в одній простій системі для незалежних готелів.',
				image: buildAbsoluteUrl(companyProfile.siteUrl, '/og-landing.jpg'),
			},
		},
		loadComponent: () =>
			import('./pages/landing/landing.component').then((m) => m.LandingComponent),
	},
	{
		path: 'pricing',
		data: {
			meta: {
				title: 'Тарифи · Hotel Upwork',
				titleSuffix: '',
				description:
					'Тарифи Hotel Upwork: безкоштовний Start з календарем і заявками з сайтів, Pro для щоденної роботи готелю та Enterprise з автоматизаціями, аналітикою і AI.',
				image: buildAbsoluteUrl(companyProfile.siteUrl, '/og-pricing.jpg'),
			},
		},
		loadComponent: () => import('./pages/pricing/pricing.component').then((m) => m.PricingComponent),
	},
	{
		path: 'pitch',
		data: {
			meta: {
				title: '5 ситуацій, які коштують готелю грошей · Hotel Upwork',
				titleSuffix: '',
				description:
					'Овербукінг, загублені передоплати, блекаути, звільнення адміністратора і контроль на відстані: як Hotel Upwork вирішує їх для готелів в Україні.',
				image: buildAbsoluteUrl(companyProfile.siteUrl, '/og-landing.jpg'),
			},
		},
		loadComponent: () => import('./pages/pitch/pitch.component').then((m) => m.PitchComponent),
	},
	{
		path: 'proposal',
		data: {
			meta: {
				title: 'Комерційна пропозиція · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: власний канал прямих бронювань і система управління готелем.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/proposal/proposal.component').then((m) => m.ProposalComponent),
	},
	{
		path: 'proposal/:slug',
		data: {
			meta: {
				title: 'Комерційна пропозиція · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: власний канал прямих бронювань і система управління готелем.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/proposal/proposal.component').then((m) => m.ProposalComponent),
	},
	{
		path: 'login',
		data: {
			meta: {
				title: 'Вхід · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: вхід до системи.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
	},
	{
		path: 'demo',
		data: {
			meta: {
				title: 'Демо-режим · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: перегляньте систему в демо-режимі за роллю та тарифом.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/demo/demo.component').then((m) => m.DemoComponent),
	},
	{
		path: 'dashboard',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Огляд готелю · Hotel Upwork',
				titleSuffix: '',
				description:
					'Hotel Upwork: щоденний центр управління готелем. Заїзди, номери, оплати та завдання в одному огляді.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
	},
	{
		path: 'calendar',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Календар · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: календар. Усі номери, бронювання та вільні дати в одному місці.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/calendar/calendar.component').then((m) => m.CalendarComponent),
	},
	{
		path: 'submissions',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Заявки · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: заявки з форм ваших сайтів в одному місці.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/submissions/submissions.component').then((m) => m.SubmissionsComponent),
	},
	{
		path: 'guests',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Гості · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: база гостей готелю, історія проживань та контакти.',
				robots: 'noindex, nofollow',
			},
		},
		// Real hotels get their guest database on live data; the demo keeps the seeded list.
		loadComponent: () =>
			isLiveSession()
				? import('./pages/guests/guests-live.component').then((m) => m.GuestsLiveComponent)
				: import('./pages/guests/guests.component').then((m) => m.GuestsComponent),
	},
	{
		path: 'rooms',
		canActivate: [roomsMovedGuard, roleGuard],
		data: {
			meta: {
				title: 'Номери · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: номерний фонд, типи номерів та їх статуси.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/rooms/rooms.component').then((m) => m.RoomsComponent),
	},
	{
		path: 'payments',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Оплати · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: оплати, заборгованості та фінансова аналітика.',
				robots: 'noindex, nofollow',
			},
		},
		// Real hotels get the payment journal on live data; the demo keeps the seeded list.
		loadComponent: () =>
			isLiveSession()
				? import('./pages/payments/payments-live.component').then((m) => m.PaymentsLiveComponent)
				: import('./pages/payments/payments.component').then((m) => m.PaymentsComponent),
	},
	{
		path: 'housekeeping',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Прибирання · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: керування прибиранням номерів та завданнями персоналу.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/housekeeping/housekeeping.component').then((m) => m.HousekeepingComponent),
	},
	{
		path: 'messages',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Повідомлення · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: спілкування з гостями в одному вхідному ящику.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/messages/messages.component').then((m) => m.MessagesComponent),
	},
	{
		path: 'automations',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Автоматизації · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: автоматичні сценарії та правила для щоденних завдань.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/automations/automations.component').then((m) => m.AutomationsComponent),
	},
	{
		path: 'sales',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Продажі · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: аналітика продажів, канали бронювань та кампанії.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/sales/sales.component').then((m) => m.SalesComponent),
	},
	{
		path: 'ai',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'AI-помічник · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: AI-помічник для швидких відповідей та дій по готелю.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/ai/ai.component').then((m) => m.AiComponent),
	},
	{
		path: 'team',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Команда · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: керування командою, ролями та доступами співробітників.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/team/team.component').then((m) => m.TeamComponent),
	},
	// Real hotels: the settings layout with one child page per section; the demo keeps the seeded single page.
	{
		path: 'settings',
		canMatch: [() => isLiveSession()],
		canActivate: [roleGuard],
		data: { meta: SETTINGS_META },
		loadComponent: () => import('./layouts/app-settings/app-settings.component').then((m) => m.AppSettingsComponent),
		children: [
			{ path: '', pathMatch: 'full', redirectTo: 'general' },
			{
				path: 'general',
				data: { section: 'general', meta: SETTINGS_META },
				loadComponent: () => import('./pages/settings/settings-live.component').then((m) => m.SettingsLiveComponent),
			},
			{
				path: 'stay',
				data: { section: 'stay', meta: SETTINGS_META },
				loadComponent: () => import('./pages/settings/settings-live.component').then((m) => m.SettingsLiveComponent),
			},
			{
				path: 'payments',
				data: { section: 'payments', meta: SETTINGS_META },
				loadComponent: () => import('./pages/settings/settings-live.component').then((m) => m.SettingsLiveComponent),
			},
			{
				path: 'booking-types',
				data: { section: 'booking-types', meta: SETTINGS_META },
				loadComponent: () => import('./pages/settings/settings-live.component').then((m) => m.SettingsLiveComponent),
			},
			{
				path: 'rooms',
				data: { section: 'rooms', meta: SETTINGS_META },
				loadComponent: () => import('./pages/settings/settings-live.component').then((m) => m.SettingsLiveComponent),
			},
		],
	},
	{
		path: 'settings',
		canMatch: [() => !isLiveSession()],
		canActivate: [roleGuard],
		data: { meta: SETTINGS_META },
		loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
	},
	{
		path: 'search',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Пошук · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: пошук гостей, бронювань, номерів та оплат.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/search/search.component').then((m) => m.SearchComponent),
	},
	{
		path: 'notifications',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Сповіщення · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: сповіщення про бронювання, оплати та завдання персоналу.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/notifications/notifications.component').then((m) => m.NotificationsComponent),
	},
	{
		path: 'profile',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Профіль · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: особисті дані, пароль та сповіщення вашого профілю.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
	},
	{
		path: 'guest',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Гість · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: профіль гостя, історія проживань, оплати та повідомлення.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/guest/guest.component').then((m) => m.GuestComponent),
	},
	{
		path: 'new-booking',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Нове бронювання · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: створення нового бронювання, вибір номера, гостя та оплати.',
				robots: 'noindex, nofollow',
			},
		},
		// Real hotels get the fast desk form on live data; the demo keeps the seeded one.
		loadComponent: () =>
			isLiveSession()
				? import('./pages/new-booking/quick-booking.component').then((m) => m.QuickBookingComponent)
				: import('./pages/new-booking/new-booking.component').then((m) => m.NewBookingComponent),
	},
	{
		path: 'booking',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Деталі бронювання · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: деталі бронювання, оплати, гості та історія змін.',
				robots: 'noindex, nofollow',
			},
		},
		// Real hotels get the editable, autosaving booking card on live data; the demo keeps the seeded one.
		loadComponent: () =>
			isLiveSession()
				? import('./pages/booking/booking-live.component').then((m) => m.BookingLiveComponent)
				: import('./pages/booking/booking.component').then((m) => m.BookingComponent),
	},
	{
		path: 'book',
		canActivate: [roleGuard],
		data: {
			meta: {
				title: 'Пошук доступності · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: пошук вільних номерів за датами та створення бронювання.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () => import('./pages/book/book.component').then((m) => m.BookComponent),
	},
	{
		path: 'confirmation',
		data: {
			meta: {
				title: 'Підтвердження бронювання · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: підтвердження бронювання, дані заїзду та оплата для гостя.',
				robots: 'noindex, nofollow',
			},
		},
		loadComponent: () =>
			import('./pages/confirmation/confirmation.component').then((m) => m.ConfirmationComponent),
	},
	{
		path: 'privacy',
		data: {
			meta: {
				title: 'Політика конфіденційності · Hotel Upwork',
				titleSuffix: '',
				description:
					'Hotel Upwork: які персональні дані ми обробляємо, навіщо та як ви можете керувати ними.',
			},
		},
		loadComponent: () => import('./pages/privacy/privacy.component').then((m) => m.PrivacyComponent),
	},
	{
		path: 'cookies',
		data: {
			meta: {
				title: 'Політика щодо cookies · Hotel Upwork',
				titleSuffix: '',
				description: 'Hotel Upwork: які файли cookie ми використовуємо та як ними керувати.',
			},
		},
		loadComponent: () => import('./pages/cookies/cookies.component').then((m) => m.CookiesComponent),
	},
	{
		path: '**',
		redirectTo: ({ url }) => {
			const role = isPlatformBrowser(inject(PLATFORM_ID)) ? getSessionRole() : null;
			const home = !role ? null : isLiveSession() ? LIVE_PAGES[0] : defaultPageFor(role);
			if (!home) return '';
			const missing = url.map((s) => s.path).join('/');
			return inject(Router).createUrlTree(['/' + home], { queryParams: { missing } });
		},
	},
];
