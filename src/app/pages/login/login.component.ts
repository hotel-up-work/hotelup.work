import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { AuthService } from '../../feature/firebase/auth.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { LIVE_PAGES, setRealRole } from '../../shared/role';

type Screen = 'login' | 'forgot' | 'checkEmail';

const AUTH_ERROR_MESSAGE: Record<string, string> = {
	'auth/invalid-email': 'Введіть правильну email-адресу.',
	'auth/invalid-credential': 'Email або пароль неправильні.',
	'auth/user-disabled': 'Цей доступ деактивовано.',
	'auth/too-many-requests': 'Забагато спроб входу. Спробуйте пізніше або відновіть пароль.',
};

function authErrorMessage(error: unknown): string {
	if (error instanceof FirebaseError) return AUTH_ERROR_MESSAGE[error.code] ?? 'Не вдалося увійти. Спробуйте ще раз.';
	return 'Не вдалося увійти. Спробуйте ще раз.';
}

@Component({
	selector: 'app-login',
	imports: [FormsModule, RouterLink],
	templateUrl: './login.component.html',
	styleUrl: './login.component.scss',
})
export class LoginComponent {
	private readonly _router = inject(Router);
	private readonly _auth = inject(AuthService);
	private readonly _hotel = inject(HotelService);

	protected readonly screen = signal<Screen>('login');

	protected readonly loginEmail = signal('');
	protected readonly loginPassword = signal('');
	protected readonly loginEmailInvalid = signal(false);
	protected readonly loginPasswordInvalid = signal(false);
	protected readonly loginError = signal('');
	protected readonly loginBusy = signal(false);
	protected readonly loginPasswordVisible = signal(false);
	protected readonly rememberMe = signal(false);

	protected readonly forgotEmail = signal('');
	protected readonly forgotBusy = signal(false);

	protected goto(screen: Screen): void {
		this.loginError.set('');
		this.screen.set(screen);
	}

	protected togglePasswordVisibility(): void {
		this.loginPasswordVisible.update((v) => !v);
	}

	protected async submitLogin(): Promise<void> {
		const email = this.loginEmail().trim();
		const password = this.loginPassword();

		this.loginEmailInvalid.set(false);
		this.loginPasswordInvalid.set(false);
		this.loginError.set('');

		let bad = false;
		if (!/^\S+@\S+\.\S+$/.test(email)) {
			this.loginEmailInvalid.set(true);
			bad = true;
		}
		if (!password) {
			this.loginPasswordInvalid.set(true);
			bad = true;
		}
		if (bad) return;

		this.loginBusy.set(true);
		try {
			const user = await this._auth.login(email, password);

			// load() also picks the active hotel: the last one used if still accessible, else the first.
			const hotels = await this._hotel.load(user.uid);
			if (!hotels.length) {
				this.loginError.set('Ваш акаунт ще не привʼязано до жодного готелю. Зверніться до адміністратора.');
				await this._auth.logout();
				return;
			}

			// Every Firebase-authenticated account is CRM staff, and the Owner assigns
			// the real role on the Team page. Until that page writes a per-user role,
			// store Owner so a returning user isn't asked to log in again next visit.
			// This is intentionally separate from demo_role (see role.ts) — most pages
			// don't read it yet, that wiring is follow-up work.
			setRealRole('owner');
			this._router.navigateByUrl('/' + LIVE_PAGES[0]);
		} catch (error) {
			this.loginError.set(authErrorMessage(error));
		} finally {
			this.loginBusy.set(false);
		}
	}

	protected async submitForgot(): Promise<void> {
		const email = this.forgotEmail().trim();
		if (!/^\S+@\S+\.\S+$/.test(email)) return;

		this.forgotBusy.set(true);
		try {
			await this._auth.sendPasswordReset(email);
		} catch {
			// Firebase already reports "user not found" here; show the same neutral
			// confirmation either way so the flow can't be used to enumerate accounts.
		} finally {
			this.forgotBusy.set(false);
			this.goto('checkEmail');
		}
	}
}
