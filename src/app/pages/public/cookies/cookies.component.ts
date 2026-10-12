import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface CookieRow {
	name: string;
	type: string;
	purpose: string;
	duration: string;
}

const COOKIE_TABLE: CookieRow[] = [
	{
		name: 'hotelup_session',
		type: 'Необхідний',
		purpose: 'Підтримує вхід у кабінет готелю під час сесії.',
		duration: 'До закриття браузера / до виходу',
	},
	{
		name: 'hotelup_remember',
		type: 'Необхідний',
		purpose: 'Використовується, якщо ви обрали "Запам’ятати мене" на вході.',
		duration: 'До 30 днів',
	},
	{
		name: 'hotelup_ui_prefs',
		type: 'Функціональний',
		purpose: 'Зберігає обрані налаштування вигляду (наприклад, кількість днів у Календарі).',
		duration: 'До 12 місяців',
	},
];

@Component({
	selector: 'app-cookies',
	imports: [RouterLink],
	templateUrl: './cookies.component.html',
	styleUrl: './cookies.component.scss',
})
export class CookiesComponent {
	protected readonly lastUpdated = '17 вересня 2026';
	protected readonly cookieTable = COOKIE_TABLE;
}
