import { Component, signal } from '@angular/core';
import type { ModalSave } from '../rooms.interface';

/** Yes/no confirmation for a destructive action (ngx-ui modal, size "small"). */
@Component({
	selector: 'app-confirm',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>{{ title }}</h2>
			<p>{{ text }}</p>
			@if (error()) {
				<p class="crm-error" role="alert">{{ error() }}</p>
			}
			<div class="crm-actions">
				<button class="crm-button secondary" type="button" (click)="close()">Скасувати</button>
				<button class="crm-button danger" type="button" [disabled]="saving()" (click)="submit()">{{ confirmText }}</button>
			</div>
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class ConfirmComponent {
	label = '';
	title = '';
	text = '';
	confirmText = 'Підтвердити';
	confirm: ModalSave<void> = async () => null;
	close: () => void = () => {};

	protected readonly error = signal('');
	protected readonly saving = signal(false);

	protected async submit(): Promise<void> {
		this.saving.set(true);
		this.error.set('');
		const error = await this.confirm();
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
