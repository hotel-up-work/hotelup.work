import { Component, inject, input, signal } from '@angular/core';
import { BookingDemoStore, STAFF } from '../booking-card.demo';

/** Demo tab: things the hotel promised or must do for this guest. */
@Component({
	selector: 'app-booking-tasks',
	styleUrl: './tab-panel.scss',
	template: `
		<section class="panel">
			<div class="panel-head">
				<h2>Завдання гостя ({{ store.tasks().length }})</h2>
				<span class="hint">Відкритих: {{ open() }}</span>
			</div>
			@for (t of store.tasks(); track t.id) {
				<div class="task" [class.done]="t.done">
					<input type="checkbox" [checked]="t.done" [disabled]="readOnly()" [attr.aria-label]="'Виконано: ' + t.title" (change)="store.toggleTask(t.id)" />
					<div class="what">
						<b>{{ t.title }}</b>
						<small>{{ t.assignee }} · до {{ t.due }}</small>
					</div>
					<button type="button" class="btn small danger" [disabled]="readOnly()" (click)="store.removeTask(t.id)">Видалити</button>
				</div>
			} @empty {
				<p class="empty">Немає активних завдань</p>
			}
		</section>

		<section class="panel">
			<div class="panel-head"><h3>Додати завдання</h3></div>
			<form class="add-row" (submit)="add($event, title.value, who.value, due.value)">
				<label class="f" style="grid-column: span 2">
					Що зробити
					<input #title maxlength="120" [disabled]="readOnly()" />
				</label>
				<label class="f">
					Виконавець
					<select #who [disabled]="readOnly()">
						@for (s of staff; track s) {
							<option [value]="s">{{ s }}</option>
						}
					</select>
				</label>
				<label class="f">
					Термін
					<input #due type="datetime-local" value="2026-09-17T12:00" [disabled]="readOnly()" />
				</label>
				<button type="submit" class="btn primary" [disabled]="readOnly()">Додати</button>
			</form>
			@if (error()) {
				<p class="hint" role="alert">{{ error() }}</p>
			}
		</section>
	`,
})
export class TasksTabComponent {
	protected readonly store = inject(BookingDemoStore);
	readonly readOnly = input(false);

	protected readonly staff = STAFF;
	protected readonly error = signal('');

	protected open(): number {
		return this.store.tasks().filter((t) => !t.done).length;
	}

	protected add(event: Event, title: string, assignee: string, due: string): void {
		event.preventDefault();
		if (!title.trim()) return void this.error.set('Опишіть завдання');
		this.error.set('');
		this.store.addTask(title, assignee, due.replace('T', ' '));
	}
}
