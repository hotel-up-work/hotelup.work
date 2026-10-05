import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { HotelService } from '../firebase/hotel.service';
import { BookingType, HotelSettings, HotelSettingsService } from '../firebase/hotel-settings.service';
import { PAYMENT_METHODS, type PaymentMethod } from '../firebase/payments.service';
import { canCurrent } from '../../shared/role';

const cloneSettings = (s: HotelSettings): HotelSettings => ({ ...s, paymentMethods: [...s.paymentMethods], bookingTypes: s.bookingTypes.map((t) => ({ ...t })) });

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fields of each section that are saved from the page's Save button (Rooms saves in its own dialogs). */
const FIELDS: (keyof HotelSettings)[] = ['name', 'city', 'phone', 'email', 'address', 'checkInTime', 'checkOutTime', 'paymentMethods', 'bankDetails', 'bookingTypes'];

/**
 * Form state of the real-hotel Settings sections: the draft copy of `hotels/{hotelId}`, validation and autosave.
 * Shared by all `/settings/*` pages so an edit still saves when the person moves to another section.
 */
@Service()
export class SettingsFormService {
	private readonly _hotel = inject(HotelService);
	private readonly _store = inject(HotelSettingsService);

	readonly METHODS = PAYMENT_METHODS;

	/** Owner and manager edit; every other role would see the page read-only. */
	readonly canEdit = canCurrent('editInventory');

	readonly hotelId = this._hotel.activeHotelId;

	/** What is stored; null until the first snapshot. */
	readonly stored = this._store.settings;
	/** The form, a copy of `stored` that the person edits. */
	readonly draft = signal<HotelSettings | null>(null);
	readonly saving = signal(false);
	readonly error = signal('');
	readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	readonly dirty = computed(() => {
		const draft = this.draft();
		const stored = this.stored();
		if (!draft || !stored) return false;
		return FIELDS.some((key) => JSON.stringify(draft[key]) !== JSON.stringify(stored[key]));
	});

	constructor() {
		// Autosave: save once the person stops changing the form for a moment.
		effect((onCleanup) => {
			this.draft();
			if (!this.dirty() || this.saving() || !this.canEdit) return;
			const timer = setTimeout(() => void this.save(), 800);
			onCleanup(() => clearTimeout(timer));
		});

		// Load the form from the hotel once it arrives; later snapshots (own saves, another tab) only replace
		// the form while there is nothing unsaved in it.
		effect(() => {
			const stored = this.stored();
			untracked(() => {
				if (!stored) return this.draft.set(null);
				if (!this.draft() || !this.dirty()) this.draft.set(cloneSettings(stored));
			});
		});
	}

	set<K extends keyof HotelSettings>(key: K, value: HotelSettings[K]): void {
		this.draft.update((d) => (d ? { ...d, [key]: value } : d));
		this.error.set('');
	}

	hasMethod(method: PaymentMethod): boolean {
		return !!this.draft()?.paymentMethods.includes(method);
	}

	/** At least one method must stay on: the desk needs something to record. */
	canToggle(method: PaymentMethod): boolean {
		const draft = this.draft();
		if (!this.canEdit || !draft) return false;
		return !(draft.paymentMethods.length === 1 && draft.paymentMethods[0] === method);
	}

	toggleMethod(method: PaymentMethod): void {
		const draft = this.draft();
		if (!draft || !this.canToggle(method)) return;
		const has = draft.paymentMethods.includes(method);
		// Keep the standard order whatever the order of clicking.
		const next = PAYMENT_METHODS.map((m) => m.value).filter((m) => (m === method ? !has : draft.paymentMethods.includes(m)));
		this.set('paymentMethods', next);
	}

	addBookingType(): void {
		const draft = this.draft();
		if (!draft || draft.bookingTypes.length >= 20) return;
		this.set('bookingTypes', [...draft.bookingTypes, { id: Math.random().toString(36).slice(2, 10), name: '', description: '', extraPrice: 0 }]);
	}

	patchBookingType(id: string, patch: Partial<BookingType>): void {
		const draft = this.draft();
		if (draft) this.set('bookingTypes', draft.bookingTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	}

	removeBookingType(id: string): void {
		const draft = this.draft();
		if (draft) this.set('bookingTypes', draft.bookingTypes.filter((t) => t.id !== id));
	}

	discard(): void {
		const stored = this.stored();
		if (stored) this.draft.set(cloneSettings(stored));
		this.error.set('');
	}

	async save(): Promise<void> {
		const draft = this.draft();
		const stored = this.stored();
		const hotelId = this.hotelId();
		if (!draft || !stored || !hotelId || this.saving() || !this.dirty()) return;

		const name = draft.name.trim();
		if (!name) return this.error.set('Вкажіть назву готелю.');
		if (draft.email.trim() && !EMAIL.test(draft.email.trim())) return this.error.set('Перевірте email: він має вигляд name@example.com.');
		if (!TIME.test(draft.checkInTime) || !TIME.test(draft.checkOutTime)) return this.error.set('Вкажіть час заселення та виїзду.');

		const types = draft.bookingTypes.map((t) => ({ ...t, name: t.name.trim(), description: t.description.trim(), extraPrice: Math.max(0, Math.round(Number(t.extraPrice) || 0)) }));
		if (types.some((t) => !t.name)) return this.error.set('Вкажіть назву кожного типу бронювання.');

		const clean: HotelSettings = {
			...draft,
			name,
			city: draft.city.trim(),
			phone: draft.phone.trim(),
			email: draft.email.trim(),
			address: draft.address.trim(),
			bankDetails: draft.bankDetails.trim(),
			bookingTypes: types,
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
