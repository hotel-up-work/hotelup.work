import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';

interface NotificationToggles {
	notifyBooking: boolean;
	notifyMessage: boolean;
	notifyPayment: boolean;
	notifyAutomation: boolean;
}

@Component({
	selector: 'app-profile',
	imports: [AppShellComponent, FormsModule, RouterLink],
	templateUrl: './profile.component.html',
	styleUrl: './profile.component.scss',
})
export class ProfileComponent {
	protected readonly firstName = signal('Олександр');
	protected readonly lastName = signal('Гончар');
	protected readonly phone = signal('+380 67 111 22 33');
	protected readonly email = signal('oleksandr@example.com');

	protected readonly displayName = signal('Олександр Гончар');
	protected readonly avatarInitials = computed(() =>
		this.displayName()
			.split(' ')
			.slice(0, 2)
			.map((p) => p[0])
			.join(''),
	);

	protected readonly currentPassword = signal('');
	protected readonly newPassword = signal('');
	protected readonly confirmPassword = signal('');

	protected readonly notifications = signal<NotificationToggles>({
		notifyBooking: true,
		notifyMessage: true,
		notifyPayment: true,
		notifyAutomation: true,
	});
	protected readonly notifyChannel = signal<'inapp' | 'email'>('inapp');

	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected toggleNotification(key: keyof NotificationToggles): void {
		this.notifications.update((n) => ({ ...n, [key]: !n[key] }));
		this.showToast('Налаштування сповіщень оновлено');
	}

	protected saveProfile(): void {
		this.displayName.set(`${this.firstName().trim()} ${this.lastName().trim()}`.trim());
		this.showToast('Профіль збережено');
	}

	protected changePassword(): void {
		const current = this.currentPassword();
		const next = this.newPassword();
		const confirm = this.confirmPassword();

		if (!current) {
			this.showToast('Введіть поточний пароль');
			return;
		}
		if (next.length < 8 || !/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
			this.showToast('Новий пароль має містити мінімум 8 символів, літеру та цифру');
			return;
		}
		if (next !== confirm) {
			this.showToast('Нові паролі не збігаються');
			return;
		}

		this.currentPassword.set('');
		this.newPassword.set('');
		this.confirmPassword.set('');
		this.showToast('Пароль змінено');
	}

	protected endSessions(): void {
		this.showToast('Усі сесії завершено, крім поточної');
	}

	protected enable2fa(): void {
		this.showToast('Налаштування 2FA ще у розробці в демонстраційній версії');
	}

	private showToast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
