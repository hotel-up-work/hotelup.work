import { Component, OnInit, Signal, signal } from '@angular/core';
import type { ModalSave, RoomTypeFormValue, RoomTypeSummary } from '../rooms.interface';

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';

/** Room type list with an inline "add type" form (ngx-ui modal). */
@Component({
	selector: 'app-room-types',
	template: `
		<div class="crm-dialog__head">HOTEL UPWORK <span>· {{ label }}</span></div>
		<div class="crm-dialog__body">
			@if (adding()) {
				<h2>Створити тип номера</h2>
				<form
					class="crm-form"
					(submit)="$event.preventDefault(); submit(nameInput.value, descInput.value, capacityInput.valueAsNumber, priceInput.valueAsNumber, extraGuestsInput.valueAsNumber, extraPriceInput.valueAsNumber)"
				>
					<label class="full">Назва<input #nameInput name="name" required maxlength="50" placeholder="Люкс" /></label>
					<label class="full">Опис<textarea #descInput name="desc" maxlength="500" placeholder="Просторий номер для двох гостей."></textarea></label>
					<label>Місткість за замовчуванням<input #capacityInput name="capacity" type="number" min="1" step="1" value="2" /></label>
					<label>Базова ціна, ₴<input #priceInput name="price" type="number" min="0" value="1600" /></label>
					<label>Додаткові місця (макс. гостей понад місткість)<input #extraGuestsInput name="extraGuests" type="number" min="0" max="20" step="1" value="0" /></label>
					<label>Ціна за додаткового гостя, ₴ / ніч<input #extraPriceInput name="extraGuestPrice" type="number" min="0" value="0" /></label>
					@if (error()) {
						<p class="full crm-error" role="alert">{{ error() }}</p>
					}
					<button class="crm-button primary full" type="submit" [disabled]="saving()">Створити тип</button>
					@if (afterAdd) {
						<button class="crm-link full" type="button" (click)="close()">Скасувати</button>
					} @else {
						<button class="crm-link full" type="button" (click)="adding.set(false)">← До списку типів</button>
					}
				</form>
			} @else {
				<h2>Типи номерів</h2>
				@if (summary().length) {
					<div class="crm-list">
						@for (t of summary(); track t.id) {
							<div class="crm-list__item">
								<span><b>{{ t.name }}</b><small>{{ t.count }} ном. · {{ t.capacity }} гості</small></span>
								<span>від {{ money(t.minPrice) }}</span>
							</div>
						}
					</div>
				} @else {
					<p>Типів номерів ще немає.</p>
				}
				@if (canEdit) {
					<div class="crm-actions">
						<button class="crm-button secondary" type="button" (click)="startAdding()">+ Додати тип</button>
					</div>
				}
			}
		</div>
	`,
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class RoomTypesComponent implements OnInit {
	label = '';
	summary: Signal<RoomTypeSummary[]> = signal([]);
	canEdit = false;
	addType: ModalSave<RoomTypeFormValue> = async () => null;
	/** Open straight on the "create type" form (from the room form). */
	startInAddMode = false;
	/** Called with the new type's name after it is saved; otherwise the list is shown again. */
	afterAdd?: (name: string) => void;
	close: () => void = () => {};

	protected readonly money = money;
	protected readonly adding = signal(false);
	protected readonly error = signal('');
	protected readonly saving = signal(false);

	ngOnInit(): void {
		if (this.startInAddMode) this.adding.set(true);
	}

	protected startAdding(): void {
		this.error.set('');
		this.adding.set(true);
	}

	protected async submit(name: string, description: string, capacity: number, price: number, extraGuests: number, extraGuestPrice: number): Promise<void> {
		this.saving.set(true);
		this.error.set('');
		const error = await this.addType({ name, description, capacity, price, extraGuests, extraGuestPrice });
		this.saving.set(false);
		if (error) this.error.set(error);
		else if (this.afterAdd) this.afterAdd(name.trim());
		else this.adding.set(false);
	}
}
