import { Component, signal } from '@angular/core';
import type { ModalSave, Room, RoomBlock } from '../rooms.interface';

const BLOCK_REASONS = ['Ремонт', 'Технічні роботи', 'Приватне використання', 'Інше'];

/** Make a room unavailable for given dates, or edit its block (ngx-ui modal). */
@Component({
	selector: 'app-block-room',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			<h2>{{ room?.status === 'unavailable' ? 'Редагувати блокування' : 'Зробити номер недоступним' }}</h2>
			<form
				class="crm-form"
				(submit)="$event.preventDefault(); submit(startInput.value, endInput.value, reasonSelect.value, noteInput.value)"
			>
				<p class="full">Номер {{ room?.number }}</p>
				<label>Початок<input #startInput name="start" type="date" required [value]="room?.blockStart || today" /></label>
				<label>Кінець<input #endInput name="end" type="date" required [value]="room?.blockEnd || today" /></label>
				<label class="full">
					Причина
					<select #reasonSelect name="reason">
						@for (reason of reasons; track reason) {
							<option [selected]="reason === room?.reason">{{ reason }}</option>
						}
					</select>
				</label>
				<label class="full">Нотатка (необовʼязково)<input #noteInput name="note" maxlength="120" [value]="room?.blockNote ?? ''" /></label>
				<p class="full crm-note">Номер буде недоступний для нових бронювань і позначений у Календарі.</p>
				@if (error()) {
					<p class="full crm-error" role="alert">{{ error() }}</p>
				}
				<button class="crm-button primary full" type="submit" [disabled]="saving()">Заблокувати</button>
			</form>
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class BlockRoomComponent {
	label = '';
	room: Room | null = null;
	/** Default start/end date, ISO `YYYY-MM-DD`. */
	today = '';
	save: ModalSave<RoomBlock> = async () => null;
	close: () => void = () => {};

	protected readonly reasons = BLOCK_REASONS;
	protected readonly error = signal('');
	protected readonly saving = signal(false);

	protected async submit(start: string, end: string, reason: string, note: string): Promise<void> {
		if (!start || !end) return this.error.set('Вкажіть дати початку і кінця.');
		if (end < start) return this.error.set('Кінець не може бути раніше за початок.');
		this.saving.set(true);
		this.error.set('');
		const error = await this.save({ start, end, reason, note: note.trim() });
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
