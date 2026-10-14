import { Component, inject, input } from '@angular/core';
import { AGE_GROUPS, BookingDemoStore, DOCUMENT_TYPES, GENDERS, REQUIRED_GUEST_KEYS, visitsLabel, type DemoGuest } from '../booking-card.demo';

type TextKey = 'lastName' | 'firstName' | 'middleName' | 'birthDate' | 'phone' | 'email' | 'citizenship' | 'city' | 'address' | 'documentNumber';
type SelectKey = 'gender' | 'ageGroup' | 'documentType';
type FlagKey = 'vip' | 'blacklist' | 'consent';

const TEXT_FIELDS: { key: TextKey; label: string; type: string; wide?: boolean }[] = [
	{ key: 'lastName', label: 'Прізвище', type: 'text' },
	{ key: 'firstName', label: 'Імʼя', type: 'text' },
	{ key: 'middleName', label: 'По батькові', type: 'text' },
	{ key: 'birthDate', label: 'Дата народження', type: 'date' },
	{ key: 'phone', label: 'Телефон', type: 'tel' },
	{ key: 'email', label: 'Електронна пошта', type: 'email' },
	{ key: 'citizenship', label: 'Громадянство', type: 'text' },
	{ key: 'city', label: 'Місто', type: 'text' },
	{ key: 'address', label: 'Адреса проживання', type: 'text', wide: true },
	{ key: 'documentNumber', label: 'Номер документа', type: 'text' },
];

const SELECT_FIELDS: { key: SelectKey; label: string; options: string[] }[] = [
	{ key: 'gender', label: 'Стать', options: GENDERS },
	{ key: 'ageGroup', label: 'Вікова категорія', options: AGE_GROUPS },
	{ key: 'documentType', label: 'Тип документа', options: DOCUMENT_TYPES },
];

const FLAGS: { key: FlagKey; label: string }[] = [
	{ key: 'vip', label: 'VIP' },
	{ key: 'blacklist', label: 'У чорному списку' },
	{ key: 'consent', label: 'Згода на отримання інформації від готелю' },
];

/** Demo tab: the people on the booking, each with a guest profile. */
@Component({
	selector: 'app-booking-guests',
	styleUrl: './tab-panel.scss',
	template: `
		<div class="panel-head">
			<h2>Анкети гостей ({{ store.guests().length }})</h2>
			<span class="hint"><span class="req">*</span> обовʼязкові поля для реєстраційної картки</span>
			<button type="button" class="btn primary" [disabled]="readOnly()" (click)="store.addGuest()">+ Додати анкету</button>
		</div>
		@for (g of store.guests(); track g.id) {
			<section class="panel">
				<div class="person-head">
					<h3>{{ fullName(g) }}</h3>
					@if (g.primary) {
						<span class="chip gold">Основний гість</span>
					}
					@if (g.vip) {
						<span class="chip gold">VIP</span>
					}
					@if (g.blacklist) {
						<span class="chip red">Чорний список</span>
					}
					<span class="chip">{{ g.stays ? g.stays + ' попередніх проживань' : 'Перше проживання' }}</span>
					@if (!g.primary) {
						<button type="button" class="btn small danger" [disabled]="readOnly()" (click)="store.removeGuest(g.id)">Видалити</button>
					}
				</div>
				<div class="form-grid">
					@for (f of textFields; track f.key) {
						<label class="f" [class.wide]="f.wide" [class.missing]="required.has(f.key) && !g[f.key]">
							<span>{{ f.label }}@if (required.has(f.key)) {<span class="req" aria-hidden="true"> *</span>}</span>
							<input
								[type]="f.type"
								[value]="g[f.key]"
								[required]="required.has(f.key)"
								[disabled]="readOnly()"
								(change)="set(g, f.key, $any($event.target).value)"
							/>
						</label>
					}
					@for (f of selectFields; track f.key) {
						<label class="f" [class.missing]="required.has(f.key) && !g[f.key]">
							<span>{{ f.label }}@if (required.has(f.key)) {<span class="req" aria-hidden="true"> *</span>}</span>
							<select [required]="required.has(f.key)" [disabled]="readOnly()" (change)="set(g, f.key, $any($event.target).value)">
								<option value="" [selected]="!g[f.key]">Не визначено</option>
								@for (o of f.options; track o) {
									<option [value]="o" [selected]="g[f.key] === o">{{ o }}</option>
								}
							</select>
						</label>
					}
					<label class="f">
						Паспорт дійсний до
						<input type="date" [value]="g.documentValidUntil" [disabled]="readOnly()" (change)="set(g, 'documentValidUntil', $any($event.target).value)" />
					</label>
					<div class="f">
						Карта лояльності
						<output class="static">{{ g.loyaltyCard }} · {{ visits(g) }}</output>
					</div>
					@for (f of flags; track f.key) {
						<label class="f check wide">
							<input type="checkbox" [checked]="g[f.key]" [disabled]="readOnly()" (change)="setFlag(g, f.key, $any($event.target).checked)" />
							{{ f.label }}
						</label>
					}
					<label class="f wide">
						Примітки про гостя
						<textarea [value]="g.notes" [disabled]="readOnly()" (change)="set(g, 'notes', $any($event.target).value)"></textarea>
					</label>
				</div>
			</section>
		}
	`,
})
export class GuestsTabComponent {
	protected readonly store = inject(BookingDemoStore);
	readonly readOnly = input(false);

	protected readonly textFields = TEXT_FIELDS;
	protected readonly selectFields = SELECT_FIELDS;
	protected readonly flags = FLAGS;
	protected readonly required = REQUIRED_GUEST_KEYS;

	protected visits(g: DemoGuest): string {
		return visitsLabel(g.stays);
	}

	protected fullName(g: DemoGuest): string {
		return [g.lastName, g.firstName, g.middleName].filter(Boolean).join(' ') || 'Новий гість';
	}

	protected set(g: DemoGuest, key: keyof DemoGuest, value: string): void {
		this.store.updateGuest(g.id, { [key]: value.trim() });
	}

	protected setFlag(g: DemoGuest, key: FlagKey, value: boolean): void {
		this.store.updateGuest(g.id, { [key]: value });
	}
}
