import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SettingsFormService } from '../../feature/settings/settings-form.service';
import { type PaymentMethod } from '../../feature/firebase/payments.service';
import { BookingType, HotelSettings } from '../../feature/firebase/hotel-settings.service';
import { RoomsComponent } from '../rooms/rooms.component';

/** One section of the real-hotel Settings (`/settings/:section`, shown inside `app-settings`); the form state lives in `SettingsFormService`. */
@Component({
	selector: 'app-settings-live',
	imports: [FormsModule, RoomsComponent],
	templateUrl: './settings-live.component.html',
	// Same look as the demo settings page.
	styleUrl: './settings.component.scss',
})
export class SettingsLiveComponent {
	private readonly _form = inject(SettingsFormService);

	protected readonly section = inject(ActivatedRoute).snapshot.data['section'] as string;

	protected readonly METHODS = this._form.METHODS;
	protected readonly canEdit = this._form.canEdit;
	protected readonly draft = this._form.draft;
	protected readonly error = this._form.error;

	protected set<K extends keyof HotelSettings>(key: K, value: HotelSettings[K]): void {
		this._form.set(key, value);
	}
	protected hasMethod(method: PaymentMethod): boolean {
		return this._form.hasMethod(method);
	}
	protected canToggle(method: PaymentMethod): boolean {
		return this._form.canToggle(method);
	}
	protected toggleMethod(method: PaymentMethod): void {
		this._form.toggleMethod(method);
	}
	protected addBookingType(): void {
		this._form.addBookingType();
	}
	protected patchBookingType(id: string, patch: Partial<BookingType>): void {
		this._form.patchBookingType(id, patch);
	}
	protected removeBookingType(id: string): void {
		this._form.removeBookingType(id);
	}
}
