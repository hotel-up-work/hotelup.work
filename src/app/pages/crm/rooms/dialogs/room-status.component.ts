import { Component, signal } from '@angular/core';
import type { ModalSave, Room, RoomStatus } from '../rooms.interface';

const STATUS_OPTIONS: { value: RoomStatus; label: string }[] = [
	{ value: 'ready', label: 'Готовий' },
	{ value: 'needs-cleaning', label: 'Потребує прибирання' },
	{ value: 'cleaning', label: 'Прибирається' },
	{ value: 'occupied', label: 'Зайнятий' },
	{ value: 'unavailable', label: 'Недоступний' },
];

/** Change a room's status by hand (ngx-ui modal). */
@Component({
	selector: 'app-room-status',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>Змінити статус</h2>
			<form class="crm-form" (submit)="$event.preventDefault(); submit($any(statusSelect.value))">
				<p class="full">Номер {{ room?.number }}</p>
				<label class="full">
					Статус
					<select #statusSelect name="status">
						@for (option of options; track option.value) {
							@if (!live || option.value !== 'occupied') {
							<option [value]="option.value" [selected]="option.value === room?.status">{{ option.label }}</option>
							}
						}
					</select>
				</label>
				<p class="full crm-note">
					@if (live) {
						Статус «Зайнятий» встановлюється автоматично, коли в календарі відмічено заїзд гостя. «Недоступний» відкриває форму блокування.
					} @else {
						Статус «Зайнятий» встановлюється автоматично при заїзді гостя.
					}
				</p>
				@if (error()) {
					<p class="full crm-error" role="alert">{{ error() }}</p>
				}
				<button class="crm-button primary full" type="submit" [disabled]="saving()">Зберегти статус</button>
			</form>
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class RoomStatusComponent {
	label = '';
	room: Room | null = null;
	live = false;
	save: ModalSave<RoomStatus> = async () => null;
	close: () => void = () => {};

	protected readonly options = STATUS_OPTIONS;
	protected readonly error = signal('');
	protected readonly saving = signal(false);

	protected async submit(status: RoomStatus): Promise<void> {
		this.saving.set(true);
		this.error.set('');
		const error = await this.save(status);
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
