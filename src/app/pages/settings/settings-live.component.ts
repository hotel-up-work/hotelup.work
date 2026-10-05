import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { HotelService } from '../../feature/firebase/hotel.service';
import { HotelSettings, HotelSettingsService } from '../../feature/firebase/hotel-settings.service';
import { PAYMENT_METHODS, type PaymentMethod } from '../../feature/firebase/payments.service';
import { canCurrent } from '../../shared/role';
import { RoomsComponent } from '../rooms/rooms.component';

type SectionId = 'general' | 'stay' | 'payments' | 'rooms';

const SECTIONS: { id: SectionId; label: string }[] = [
	{ id: 'general', label: 'Загальне та контакти' },
	{ id: 'stay', label: 'Заселення та виїзд' },
	{ id: 'payments', label: 'Оплати' },
	{ id: 'rooms', label: 'Номери' },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fields of each section that are saved from the page's Save button (Rooms saves in its own dialogs). */
const FIELDS: (keyof HotelSettings)[] = ['name', 'city', 'phone', 'email', 'address', 'checkInTime', 'checkOutTime', 'paymentMethods', 'bankDetails'];

/**
 * Real hotels: the one-time setup of the hotel (profile, desk defaults, payment methods) and its rooms.
 * Everything lives in `hotels/{hotelId}`; the demo keeps the seeded settings page (CRM.md → settings).
 */
@Component({
	selector: 'app-settings-live',
	imports: [AppShellComponent, FormsModule, RoomsComponent],
	templateUrl: './settings-live.component.html',
	// Same look as the demo settings page.
	styleUrl: './settings.component.scss',
})
export class SettingsLiveComponent {
	private readonly _hotel = inject(HotelService);
	private readonly _store = inject(HotelSettingsService);
	private readonly _router = inject(Router);
	private readonly _route = inject(ActivatedRoute);
	private readonly _query = toSignal(this._route.queryParamMap);

	protected readonly SECTIONS = SECTIONS;
	protected readonly METHODS = PAYMENT_METHODS;

	/** Owner and manager edit; every other role would see the page read-only. */
	protected readonly canEdit = canCurrent('editInventory');

	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	protected readonly section = computed<SectionId>(() => {
		const tab = this._query()?.get('tab');
		return SECTIONS.some((s) => s.id === tab) ? (tab as SectionId) : 'general';
	});

	/** What is stored; null until the first snapshot. */
	protected readonly stored = this._store.settings;
	/** The form, a copy of `stored` that the person edits. */
	protected readonly draft = signal<HotelSettings | null>(null);
	protected readonly saving = signal(false);
	protected readonly error = signal('');
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly dirty = computed(() => {
		const draft = this.draft();
		const stored = this.stored();
		if (!draft || !stored) return false;
		return FIELDS.some((key) => JSON.stringify(draft[key]) !== JSON.stringify(stored[key]));
	});

	constructor() {
		// Load the form from the hotel once it arrives; later snapshots (own saves, another tab) only replace
		// the form while there is nothing unsaved in it.
		effect(() => {
			const stored = this.stored();
			untracked(() => {
				if (!stored) return this.draft.set(null);
				if (!this.draft() || !this.dirty()) this.draft.set({ ...stored, paymentMethods: [...stored.paymentMethods] });
			});
		});
	}

	protected goToSection(id: SectionId): void {
		this._router.navigate([], { queryParams: { tab: id }, replaceUrl: true });
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	protected set<K extends keyof HotelSettings>(key: K, value: HotelSettings[K]): void {
		this.draft.update((d) => (d ? { ...d, [key]: value } : d));
		this.error.set('');
	}

	protected hasMethod(method: PaymentMethod): boolean {
		return !!this.draft()?.paymentMethods.includes(method);
	}

	/** At least one method must stay on: the desk needs something to record. */
	protected canToggle(method: PaymentMethod): boolean {
		const draft = this.draft();
		if (!this.canEdit || !draft) return false;
		return !(draft.paymentMethods.length === 1 && draft.paymentMethods[0] === method);
	}

	protected toggleMethod(method: PaymentMethod): void {
		const draft = this.draft();
		if (!draft || !this.canToggle(method)) return;
		const has = draft.paymentMethods.includes(method);
		// Keep the standard order whatever the order of clicking.
		const next = PAYMENT_METHODS.map((m) => m.value).filter((m) => (m === method ? !has : draft.paymentMethods.includes(m)));
		this.set('paymentMethods', next);
	}

	protected discard(): void {
		const stored = this.stored();
		if (stored) this.draft.set({ ...stored, paymentMethods: [...stored.paymentMethods] });
		this.error.set('');
	}

	protected async save(): Promise<void> {
		const draft = this.draft();
		const stored = this.stored();
		const hotelId = this.hotelId();
		if (!draft || !stored || !hotelId || this.saving() || !this.dirty()) return;

		const name = draft.name.trim();
		if (!name) return this.error.set('Вкажіть назву готелю.');
		if (draft.email.trim() && !EMAIL.test(draft.email.trim())) return this.error.set('Перевірте email: він має вигляд name@example.com.');
		if (!TIME.test(draft.checkInTime) || !TIME.test(draft.checkOutTime)) return this.error.set('Вкажіть час заселення та виїзду.');

		const clean: HotelSettings = {
			...draft,
			name,
			city: draft.city.trim(),
			phone: draft.phone.trim(),
			email: draft.email.trim(),
			address: draft.address.trim(),
			bankDetails: draft.bankDetails.trim(),
		};
		const patch: Partial<HotelSettings> = {};
		for (const key of FIELDS) {
			if (JSON.stringify(clean[key]) !== JSON.stringify(stored[key])) (patch as Record<string, unknown>)[key] = clean[key];
		}

		this.saving.set(true);
		this.error.set('');
		try {
			await this._store.save(hotelId, patch);
			this.toast('Налаштування збережено');
		} catch (error) {
			console.error('Saving hotel settings failed', error);
			this.error.set('Не вдалося зберегти. Перевірте зʼєднання та права доступу, потім спробуйте ще раз.');
		} finally {
			this.saving.set(false);
		}
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}
}
