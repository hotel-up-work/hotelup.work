import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppShellComponent } from '../app-shell/app-shell.component';
import { HotelService } from '../../feature/firebase/hotel.service';
import { SettingsFormService } from '../../feature/settings/settings-form.service';

const SECTIONS = [
	{ id: 'general', label: 'Загальне та контакти' },
	{ id: 'stay', label: 'Заселення та виїзд' },
	{ id: 'payments', label: 'Оплати' },
	{ id: 'booking-types', label: 'Типи бронювання' },
	{ id: 'rooms', label: 'Номери' },
];

/**
 * Layout of the real-hotel Settings area (`/settings`): the app shell, a side nav with one link per section and
 * the section page (`/settings/:section`, a child route) in the outlet.
 */
@Component({
	selector: 'app-settings',
	imports: [AppShellComponent, RouterLink, RouterOutlet],
	templateUrl: './app-settings.component.html',
	styleUrl: './app-settings.component.scss',
})
export class AppSettingsComponent {
	private readonly _hotel = inject(HotelService);
	private readonly _router = inject(Router);
	protected readonly form = inject(SettingsFormService);

	protected readonly sections = SECTIONS;

	private readonly _url = toSignal(
		this._router.events.pipe(
			filter((e): e is NavigationEnd => e instanceof NavigationEnd),
			map((e) => e.urlAfterRedirects),
		),
		{ initialValue: this._router.url },
	);
	protected readonly section = computed(() => {
		const id = this._url().split(/[?#]/)[0].split('/')[2];
		return SECTIONS.some((s) => s.id === id) ? id : 'general';
	});

	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected goTo(id: string): void {
		this._router.navigate(['/settings', id]);
	}
}
