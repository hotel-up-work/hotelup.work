import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

interface SearchEntry {
	group: string;
	icon: string;
	title: string;
	sub: string;
	href: string;
}

const INDEX: SearchEntry[] = [
	{ group: 'Гості', icon: 'guests', title: 'Ірина Шевченко', sub: '+380 97 654 32 10 · 3 бронювання', href: '/guests' },
	{ group: 'Гості', icon: 'guests', title: 'Олег Бондар', sub: '#1842 · Заборгованість 1 200 ₴', href: '/guests' },
	{ group: 'Бронювання', icon: 'booking', title: 'Бронювання #1842', sub: 'Олег Бондар · 17–20 вересня · Не оплачено', href: '/calendar' },
	{ group: 'Бронювання', icon: 'booking', title: 'Бронювання #2004', sub: 'Ірина Шевченко · 18–20 вересня · Очікує', href: '/calendar' },
	{ group: 'Номери', icon: 'hotel', title: 'Номер 205', sub: 'Стандарт · 2 гості · Зайнятий', href: '/rooms' },
	{ group: 'Номери', icon: 'hotel', title: 'Номер 101', sub: 'Стандарт · 2 гості · Вільний', href: '/rooms' },
	{ group: 'Оплати', icon: 'wallet', title: 'Оплата #P-118', sub: '1 200 ₴ · Очікує підтвердження', href: '/payments' },
];

const RECENT_QUERIES = ['Ірина Шевченко', '205', '#1842', 'Олег Бондар'];

@Component({
	selector: 'app-search',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './search.component.html',
	styleUrl: './search.component.scss',
})
export class SearchComponent {
	protected readonly recentQueries = RECENT_QUERIES;

	protected readonly query = signal('');

	protected readonly groups = computed(() => {
		const query = this.query().trim().toLocaleLowerCase('uk-UA').replace('#', '');
		if (!query) return [];

		const hits = INDEX.filter((entry) =>
			(entry.title + ' ' + entry.sub).toLocaleLowerCase('uk-UA').replace('#', '').includes(query),
		);

		const byGroup = new Map<string, SearchEntry[]>();
		for (const hit of hits) {
			const list = byGroup.get(hit.group) ?? [];
			list.push(hit);
			byGroup.set(hit.group, list);
		}
		return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
	});

	protected readonly hasQuery = computed(() => this.query().trim().length > 0);
	protected readonly noResults = computed(() => this.hasQuery() && this.groups().length === 0);

	protected search(value: string): void {
		this.query.set(value);
	}

	protected pickRecent(value: string): void {
		this.query.set(value);
	}
}
