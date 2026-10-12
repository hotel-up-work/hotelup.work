import { Component, signal } from '@angular/core';
import type { GuestRecord } from '../../../feature/firebase/guests.service';
import type { ModalSave } from '../../rooms/rooms.interface';

export interface MergeCandidate {
	guest: GuestRecord;
	bookings: number;
	/** Same phone or same name as the guest being kept: very likely a duplicate. */
	likely: boolean;
}

/** Fold a duplicate profile into this guest (ngx-ui modal). */
@Component({
	selector: 'app-guest-merge',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>Обʼєднати дублікати</h2>
			<form class="crm-form" (submit)="$event.preventDefault(); submit(otherSelect.value)">
				<p class="full">Залишається профіль <b>{{ guest?.name }}</b>. Оберіть дублікат: його бронювання перейдуть сюди, а сам профіль буде видалено.</p>
				<label class="full">
					Дублікат
					<select #otherSelect name="other">
						@for (c of candidates; track c.guest.id) {
							<option [value]="c.guest.id">{{ c.likely ? '★ ' : '' }}{{ c.guest.name }}{{ c.guest.phone ? ' · ' + c.guest.phone : '' }} · бронювань: {{ c.bookings }}</option>
						}
					</select>
				</label>
				<p class="full crm-note">★ — той самий телефон або імʼя. Відсутні контакти, теги та нотатки дубліката буде додано до цього профілю. Історія бронювань залишається.</p>
				@if (error()) {
					<p class="full crm-error" role="alert">{{ error() }}</p>
				}
				<button class="crm-button primary full" type="submit" [disabled]="saving() || !candidates.length">Обʼєднати</button>
			</form>
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class GuestMergeComponent {
	label = '';
	guest: GuestRecord | null = null;
	candidates: MergeCandidate[] = [];
	save: ModalSave<string> = async () => null;
	close: () => void = () => {};

	protected readonly error = signal('');
	protected readonly saving = signal(false);

	protected async submit(otherId: string): Promise<void> {
		if (!otherId) return this.error.set('Оберіть гостя, якого треба обʼєднати.');
		this.saving.set(true);
		this.error.set('');
		const error = await this.save(otherId);
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
