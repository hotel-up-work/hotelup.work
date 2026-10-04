import { Component, OnInit, signal } from '@angular/core';
import type { GuestInput, GuestRecord } from '../../../feature/firebase/guests.service';
import type { ModalSave } from '../../rooms/rooms.interface';

/** Add or edit a guest (ngx-ui modal). Props are set by `ModalService.show()`. */
@Component({
	selector: 'app-guest-form',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>{{ guest ? 'Редагувати гостя' : 'Новий гість' }}</h2>
			<form
				class="crm-form"
				(submit)="$event.preventDefault(); submit(nameInput.value, phoneInput.value, emailInput.value, notesInput.value)"
			>
				<label class="full">Імʼя *<input #nameInput name="name" required maxlength="200" [value]="guest?.name ?? ''" /></label>
				<label>Телефон<input #phoneInput name="phone" type="tel" maxlength="40" placeholder="+380 …" [value]="guest?.phone ?? ''" /></label>
				<label>Email<input #emailInput name="email" type="email" maxlength="200" [value]="guest?.email ?? ''" /></label>
				<div class="full">
					<span>Теги</span>
					<div class="crm-chips" role="group" aria-label="Теги гостя">
						@for (tag of tagOptions; track tag) {
							<button type="button" class="crm-chip" [class.on]="tags().includes(tag)" [attr.aria-pressed]="tags().includes(tag)" (click)="toggle(tag)">{{ tag }}</button>
						}
					</div>
				</div>
				<label class="full">
					Нотатки
					<textarea #notesInput name="notes" maxlength="2000" placeholder="Побажання, алергії, особливості…" [value]="guest?.notes ?? ''"></textarea>
				</label>
				@if (error()) {
					<p class="full crm-error" role="alert">{{ error() }}</p>
				}
				<button class="crm-button primary full" type="submit" [disabled]="saving()">{{ guest ? 'Зберегти' : 'Додати гостя' }}</button>
			</form>
		</div>
	`,
	styles: `
		.crm-chips {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 8px;
		}
		.crm-chip {
			border: 1px solid var(--crm-line, #e5e5e8);
			border-radius: 999px;
			background: transparent;
			color: inherit;
			padding: 7px 14px;
			font-size: 12px;
			cursor: pointer;
		}
		.crm-chip.on {
			border-color: #c5a15a;
			background: #f6f0e3;
			color: #8b6c30;
			font-weight: 700;
		}
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class GuestFormComponent implements OnInit {
	label = '';
	/** The guest being edited; null adds a new one. */
	guest: GuestRecord | null = null;
	tagOptions: string[] = [];
	save: ModalSave<GuestInput> = async () => null;
	close: () => void = () => {};

	protected readonly tags = signal<string[]>([]);
	protected readonly error = signal('');
	protected readonly saving = signal(false);

	ngOnInit(): void {
		this.tags.set([...(this.guest?.tags ?? [])]);
		// Tags a guest already has stay selectable even if they are not among the presets.
		this.tagOptions = [...new Set([...this.tagOptions, ...this.tags()])];
	}

	protected toggle(tag: string): void {
		this.tags.update((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]));
	}

	protected async submit(name: string, phone: string, email: string, notes: string): Promise<void> {
		if (!name.trim()) return this.error.set('Вкажіть імʼя гостя.');
		this.saving.set(true);
		this.error.set('');
		const error = await this.save({ name, phone, email, notes, tags: this.tags() });
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
