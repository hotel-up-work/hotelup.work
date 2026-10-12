import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

type NotificationKind = 'warn' | 'ok' | 'default';

interface Notification {
	id: number;
	kind: NotificationKind;
	read: boolean;
	title: string;
	desc: string;
	time: string;
	href: string;
	cta: string;
}

type Filter = 'all' | 'unread';

const SEED_NOTIFICATIONS: Notification[] = [
	{
		id: 1,
		kind: 'warn',
		read: false,
		title: 'Номер 204 ще не готовий',
		desc: 'Заїзд о 13:30 · Відповідальна: Марія',
		time: '10 хв тому',
		href: '/housekeeping',
		cta: 'Відкрити прибирання',
	},
	{
		id: 2,
		kind: 'warn',
		read: false,
		title: 'Не отримано оплату',
		desc: 'Олег Бондар · Бронювання #1842 · Залишок 1 200 ₴',
		time: '32 хв тому',
		href: '/payments',
		cta: 'Відкрити бронювання',
	},
	{
		id: 3,
		kind: 'default',
		read: false,
		title: 'Нове повідомлення від гостя',
		desc: 'Ірина Шевченко запитує про ранній заїзд',
		time: '1 год тому',
		href: '/messages',
		cta: 'Відповісти',
	},
	{
		id: 4,
		kind: 'ok',
		read: true,
		title: 'Оплату підтверджено',
		desc: 'Бронювання #2004 · 4 800 ₴',
		time: 'вчора',
		href: '/payments',
		cta: 'Деталі оплати',
	},
	{
		id: 5,
		kind: 'default',
		read: true,
		title: 'Нове бронювання',
		desc: 'Номер 101 · 19–21 вересня',
		time: 'вчора',
		href: '/calendar',
		cta: 'Відкрити бронювання',
	},
	{
		id: 6,
		kind: 'ok',
		read: true,
		title: 'Прибирання завершено',
		desc: 'Номер 305 готовий до заїзду',
		time: '2 дні тому',
		href: '/housekeeping',
		cta: 'Відкрити прибирання',
	},
];

const ICON_FOR_KIND: Record<NotificationKind, string> = {
	warn: 'attention',
	ok: 'check',
	default: 'bell',
};

@Component({
	selector: 'app-notifications',
	imports: [AppShellComponent, IconComponent, RouterLink],
	templateUrl: './notifications.component.html',
	styleUrl: './notifications.component.scss',
})
export class NotificationsComponent {
	protected readonly iconForKind = ICON_FOR_KIND;

	protected readonly notifications = signal<Notification[]>(SEED_NOTIFICATIONS.map((n) => ({ ...n })));
	protected readonly filter = signal<Filter>('all');

	protected readonly filteredNotifications = computed(() => {
		const filter = this.filter();
		return this.notifications().filter((n) => filter === 'all' || !n.read);
	});

	protected readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

	protected setFilter(filter: Filter): void {
		this.filter.set(filter);
	}

	protected markAllRead(): void {
		this.notifications.update((items) => items.map((n) => ({ ...n, read: true })));
	}
}
