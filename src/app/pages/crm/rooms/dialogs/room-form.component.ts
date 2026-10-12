import { Component, OnInit, computed, signal } from '@angular/core';
import type { ModalSave, Room, RoomFormValue, RoomType } from '../rooms.interface';

/** Add or edit a room (ngx-ui modal). Props are set by `ModalService.show()`. */
@Component({
	selector: 'app-room-form',
	templateUrl: './room-form.component.html',
	host: { class: 'crm-dialog', '(document:keydown.escape)': 'close()' },
})
export class RoomFormComponent implements OnInit {
	label = '';
	/** The room being edited; null adds a new room. */
	room: Room | null = null;
	types: RoomType[] = [];
	/** Type names a room can be moved to (types plus legacy names in use). */
	typeNames: string[] = [];
	save: ModalSave<RoomFormValue> = async () => null;
	/** Type to preselect, e.g. one just created from this form. */
	initialType = '';
	/** Values typed before leaving to create a type (add only). */
	draft: { number?: string; floor?: number } = {};
	/** Leaves this form to create a room type; gets the values typed so far. */
	createType?: (draft: { number: string; floor: number }) => void;
	/** Opens the delete confirmation (edit only). */
	remove?: () => void;
	close: () => void = () => {};

	protected typeOptions: string[] = [];
	protected readonly typeName = signal('');
	protected readonly error = signal('');
	protected readonly saving = signal(false);
	/** Defaults of the picked type prefill capacity, price and area of a new room. */
	protected readonly defaults = computed(() => this.types.find((t) => t.name === this.typeName()) ?? null);

	ngOnInit(): void {
		this.typeOptions = this.room ? this.typeNames : this.types.map((t) => t.name);
		const initial = this.typeOptions.includes(this.initialType) ? this.initialType : '';
		this.typeName.set(initial || (this.room?.type ?? this.types[0]?.name ?? ''));
	}

	protected async submit(number: string, floor: number, capacity: number, price: number, area: number, extraGuests: number, extraGuestPrice: number): Promise<void> {
		this.saving.set(true);
		this.error.set('');
		const error = await this.save({ number, type: this.typeName(), floor, capacity, price, area, extraGuests, extraGuestPrice });
		this.saving.set(false);
		if (error) this.error.set(error);
		else this.close();
	}
}
