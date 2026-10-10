import { Component, computed, inject, input, signal } from '@angular/core';
import { BookingDemoStore, RECORD_TABS, type RecordColumn } from '../booking-card.demo';
import type { TabId } from '../booking-card.fields';
import { dayLabel, money } from './format';

/** Demo tab: a list of rows with an add form. Keys, rental, expenses, charge transfers, calls and vouchers share it. */
@Component({
	selector: 'app-booking-records',
	styleUrl: './tab-panel.scss',
	template: `
		@if (def(); as d) {
			<section class="panel">
				<div class="panel-head">
					<h2>{{ d.title }} ({{ rows().length }})</h2>
					<span class="hint">{{ d.hint }}</span>
				</div>
				@if (rows().length) {
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									@for (c of d.columns; track c.key) {
										<th [class.num]="c.kind === 'money' || c.kind === 'number'">{{ c.label }}</th>
									}
									<th></th>
								</tr>
							</thead>
							<tbody>
								@for (r of rows(); track r.id) {
									<tr>
										@for (c of d.columns; track c.key) {
											<td [class.num]="c.kind === 'money' || c.kind === 'number'">{{ show(c, r[c.key]) }}</td>
										}
										<td class="num">
											<button type="button" class="btn small danger" [disabled]="readOnly()" (click)="store.removeRecord(tab(), r.id)">Видалити</button>
										</td>
									</tr>
								}
							</tbody>
						</table>
					</div>
				} @else {
					<p class="empty">Записів ще немає</p>
				}
			</section>

			<section class="panel">
				<div class="panel-head"><h3>Додати запис</h3></div>
				<form class="form-grid" (submit)="add($event, form)" #form>
					@for (c of d.columns; track c.key) {
						<label class="f" [class.wide]="c.wide">
							{{ c.label }}
							@switch (c.kind) {
								@case ('select') {
									<select [name]="c.key" [disabled]="readOnly()">
										@for (o of c.options; track o) {
											<option [value]="o">{{ o }}</option>
										}
									</select>
								}
								@case ('date') {
									<input type="date" [name]="c.key" [value]="c.initial ?? ''" [disabled]="readOnly()" />
								}
								@case ('number') {
									<input type="number" min="0" [name]="c.key" [value]="c.initial ?? ''" [disabled]="readOnly()" />
								}
								@case ('money') {
									<input type="number" min="0" step="0.01" [name]="c.key" [value]="c.initial ?? ''" [disabled]="readOnly()" />
								}
								@default {
									<input type="text" maxlength="120" [name]="c.key" [value]="c.initial ?? ''" [disabled]="readOnly()" />
								}
							}
						</label>
					}
					<div class="wide">
						<button type="submit" class="btn primary" [disabled]="readOnly()">Додати</button>
					</div>
				</form>
				@if (error()) {
					<p class="hint" role="alert">{{ error() }}</p>
				}
			</section>
		}
	`,
})
export class RecordsTabComponent {
	protected readonly store = inject(BookingDemoStore);
	readonly tab = input.required<TabId>();
	readonly readOnly = input(false);

	protected readonly error = signal('');
	protected readonly def = computed(() => RECORD_TABS[this.tab()]);
	protected readonly rows = computed(() => this.store.records()[this.tab()] ?? []);

	protected show(c: RecordColumn, value: string | undefined): string {
		if (!value) return '';
		if (c.kind === 'money') return money(Number(value));
		if (c.kind === 'date') return dayLabel(value);
		return value;
	}

	protected add(event: Event, form: HTMLFormElement): void {
		event.preventDefault();
		const d = this.def();
		if (!d) return;
		const data = new FormData(form);
		const row: Record<string, string> = {};
		for (const c of d.columns) row[c.key] = String(data.get(c.key) ?? '').trim();
		const first = d.columns[0];
		const required = d.columns.find((c) => c.kind === 'text') ?? first;
		if (!row[required.key]) return void this.error.set(`Заповніть поле «${required.label}»`);
		const bad = d.columns.find((c) => (c.kind === 'money' || c.kind === 'number') && row[c.key] !== '' && !(Number(row[c.key]) >= 0));
		if (bad) return void this.error.set(`«${bad.label}»: число від 0`);
		this.error.set('');
		this.store.addRecord(this.tab(), row);
		for (const c of d.columns) if (c.kind === 'text' && !c.initial) (form.elements.namedItem(c.key) as HTMLInputElement).value = '';
	}
}
