import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';

type Tab = 'active' | 'disabled' | 'templates' | 'history';

interface Automation {
	id: number;
	name: string;
	when: string;
	timing: string | null;
	condition: string | null;
	channel: string;
	template: string | null;
	active: boolean;
	statsToday: number;
	statsMonth: number;
	next?: string;
	nextCount?: number;
	description: string;
	history30: { done: number; ok: number; fail: number; scheduled: number };
}

interface HistoryEntry {
	time: string;
	name: string;
	guest: string;
	bookingId: number;
	channel: string;
	result: 'sent' | 'failed' | 'skipped';
	reason?: string;
}

interface UpcomingRun {
	time: string;
	guest: string;
	bookingId: number;
	name: string;
}

interface TemplateDef {
	id: string;
	name: string;
	recommended: boolean;
	text: string;
}

interface WizardState {
	step: number;
	when: string | null;
	timing: string | null;
	condition: string;
	action: string;
	channel: string;
	template: string | null;
	customText: string;
}

type DialogView =
	| { kind: 'disable-confirm'; id: number }
	| { kind: 'add-preset'; templateId: string }
	| { kind: 'ai-create' }
	| { kind: 'wizard' }
	| null;

const TEMPLATE_LIB: TemplateDef[] = [
	{ id: 'confirm', name: 'Підтвердження бронювання', recommended: true, text: 'Вітаємо, {{guest.firstName}}!\nВаше бронювання в {{hotel.name}} підтверджено.' },
	{ id: 'arrival', name: 'Перед заїздом', recommended: true, text: 'Вітаємо, {{guest.firstName}}!\nНагадуємо, що завтра очікуємо вас у {{hotel.name}}. Заселення доступне після {{hotel.checkInTime}}.' },
	{ id: 'payment', name: 'Нагадування про оплату', recommended: true, text: 'Вітаємо, {{guest.firstName}}!\nЗа вашим бронюванням залишилося оплатити {{booking.balance}}.' },
	{ id: 'arrivalTime', name: 'Запит часу прибуття', recommended: true, text: 'Підкажіть, будь ласка, приблизний час вашого прибуття.' },
	{ id: 'checkout', name: 'Нагадування про check-out', recommended: false, text: 'Доброго ранку, {{guest.firstName}}! Нагадуємо, що сьогодні check-out.' },
	{ id: 'thanks', name: 'Подяка після проживання', recommended: false, text: 'Дякуємо, {{guest.firstName}}, що гостювали у нас!' },
];
const WHEN_OPTIONS = ['Створено бронювання', 'Бронювання підтверджено', 'Перед заїздом', 'У день заїзду', 'Після заселення', 'Перед виїздом', 'Після виїзду', 'Оплата отримана', 'Є неоплачений залишок'];
const TIMING_BEFORE = ['1 година', '3 години', '12 годин', '24 години', '2 дні'];
const CONDITIONS = ['Без додаткових умов', 'Не оплачено', 'Частково оплачено', 'Оплачено', 'Час прибуття невідомий', 'Час прибуття відомий', 'Новий гість', 'Постійний гість'];
const WIZARD_STEPS = ['when', 'condition', 'action', 'review'] as const;

const SEED_AUTOMATIONS: Automation[] = [
	{ id: 1, name: 'Підтвердження бронювання', when: 'Створено бронювання', timing: null, condition: null, channel: 'Email', template: 'confirm', active: true, statsToday: 4, statsMonth: 86, description: 'Автоматично надсилає гостю підтвердження одразу після створення бронювання.', history30: { done: 86, ok: 85, fail: 1, scheduled: 0 } },
	{ id: 2, name: 'Інструкція перед заїздом', when: 'Перед заїздом', timing: '24 години', condition: null, channel: 'Email', template: 'arrival', active: true, statsToday: 3, statsMonth: 54, next: 'Сьогодні · 14:00', nextCount: 3, description: 'Надсилає інформацію про заселення за добу до заїзду.', history30: { done: 54, ok: 52, fail: 2, scheduled: 6 } },
	{ id: 3, name: 'Запитати час прибуття', when: 'У день заїзду', timing: '09:00', condition: 'Час прибуття невідомий', channel: 'Email', template: 'arrivalTime', active: true, statsToday: 2, statsMonth: 31, description: 'Якщо гість не вказав час прибуття, Hotel Upwork запитує це вранці у день заїзду.', history30: { done: 31, ok: 30, fail: 0, scheduled: 2 } },
	{ id: 4, name: 'Нагадування про оплату', when: 'Перед заїздом', timing: '24 години', condition: 'Є неоплачений залишок', channel: 'Email', template: 'payment', active: true, statsToday: 1, statsMonth: 22, description: 'Нагадує гостю про неоплачений залишок перед заїздом.', history30: { done: 48, ok: 46, fail: 2, scheduled: 8 } },
	{ id: 5, name: 'Нагадування про виїзд', when: 'Перед виїздом', timing: '09:00', condition: null, channel: 'Email', template: 'checkout', active: true, statsToday: 2, statsMonth: 28, description: 'Нагадує гостю про час check-out у день виїзду.', history30: { done: 28, ok: 28, fail: 0, scheduled: 3 } },
	{ id: 6, name: 'Подяка після проживання', when: 'Після виїзду', timing: '2 години', condition: null, channel: 'Email', template: 'thanks', active: true, statsToday: 1, statsMonth: 19, description: 'Надсилає подяку через 2 години після виїзду гостя.', history30: { done: 19, ok: 19, fail: 0, scheduled: 1 } },
];

const HISTORY_LOG: HistoryEntry[] = [
	{ time: '17 вересня · 11:15', name: 'Нагадування про оплату', guest: 'Олег Бондар', bookingId: 1847, channel: 'Email', result: 'sent' },
	{ time: '17 вересня · 09:00', name: 'Перед заїздом', guest: 'Анна Коваленко', bookingId: 1842, channel: 'Email', result: 'failed', reason: 'Email не вказано.' },
	{ time: '17 вересня · 09:00', name: 'Нагадування про оплату', guest: 'Марія Петренко', bookingId: 1853, channel: 'Email', result: 'skipped', reason: 'Бронювання вже оплачено.' },
	{ time: '16 вересня · 14:00', name: 'Інструкція перед заїздом', guest: 'Анна Коваленко', bookingId: 1842, channel: 'Email', result: 'sent' },
	{ time: '14 вересня · 12:14', name: 'Підтвердження бронювання', guest: 'Анна Коваленко', bookingId: 1842, channel: 'Email', result: 'sent' },
];

const UPCOMING_RUNS: UpcomingRun[] = [
	{ time: 'Сьогодні · 14:00', guest: 'Анна Коваленко', bookingId: 1842, name: 'Перед заїздом' },
	{ time: 'Сьогодні · 16:00', guest: 'Олег Бондар', bookingId: 1847, name: 'Нагадування про оплату' },
	{ time: 'Завтра · 09:00', guest: 'Марія Петренко', bookingId: 1851, name: 'Час прибуття' },
];

const RESULT_LABEL: Record<HistoryEntry['result'], string> = { sent: 'Надіслано', failed: 'Помилка', skipped: 'Пропущено' };

function aiParsePrompt(text: string): { when: string; timing: string | null; condition: string; channel: string; template: string | null } {
	const low = text.toLocaleLowerCase('uk-UA');
	const w = { when: 'Перед заїздом', timing: '24 години', condition: 'Час прибуття невідомий', channel: 'Email', template: 'arrivalTime' };
	if (/оплат/.test(low)) {
		w.condition = 'Не оплачено';
		w.template = 'payment';
	}
	if (/виїзд|check-?out/.test(low)) {
		w.when = 'Перед виїздом';
		w.timing = '09:00';
		w.condition = 'Без додаткових умов';
		w.template = 'checkout';
	}
	if (/подяк|дякуємо/.test(low)) {
		w.when = 'Після виїзду';
		w.timing = '2 години';
		w.condition = 'Без додаткових умов';
		w.template = 'thanks';
	}
	return w;
}

@Component({
	selector: 'app-automations',
	imports: [AppShellComponent, IconComponent, FormsModule],
	templateUrl: './automations.component.html',
	styleUrl: './automations.component.scss',
})
export class AutomationsComponent {
	protected readonly TEMPLATE_LIB = TEMPLATE_LIB;
	protected readonly WHEN_OPTIONS = WHEN_OPTIONS;
	protected readonly TIMING_BEFORE = TIMING_BEFORE;
	protected readonly CONDITIONS = CONDITIONS;
	protected readonly WIZARD_STEPS = WIZARD_STEPS;
	protected readonly RESULT_LABEL = RESULT_LABEL;
	protected readonly historyLog = HISTORY_LOG;
	protected readonly upcomingRuns = UPCOMING_RUNS;

	protected readonly automations = signal<Automation[]>(SEED_AUTOMATIONS.map((a) => ({ ...a, history30: { ...a.history30 } })));
	protected readonly tab = signal<Tab>('active');
	protected readonly selectedId = signal<number | null>(null);
	protected readonly dialogView = signal<DialogView>(null);
	protected readonly wizard = signal<WizardState | null>(null);
	protected readonly toastMessage = signal('');

	private _toastTimer?: ReturnType<typeof setTimeout>;
	private _aiTimer?: ReturnType<typeof setTimeout>;

	protected readonly counts = computed(() => {
		const list = this.automations();
		const active = list.filter((a) => a.active).length;
		const today = list.reduce((s, a) => s + a.statsToday, 0);
		const scheduled = 24;
		const attention = this.historyLog.filter((h) => h.result === 'failed').length;
		return { active, today, scheduled, attention };
	});

	protected readonly activeList = computed(() => this.automations().filter((a) => a.active));
	protected readonly disabledList = computed(() => this.automations().filter((a) => !a.active));

	protected readonly selected = computed(() => this.automations().find((a) => a.id === this.selectedId()));
	protected readonly selectedUpcoming = computed(() => {
		const a = this.selected();
		if (!a) return [];
		return this.upcomingRuns.filter((u) => u.name === a.when || u.name === a.name);
	});
	protected readonly selectedTemplateName = computed(() => {
		const a = this.selected();
		return TEMPLATE_LIB.find((t) => t.id === a?.template)?.name ?? '-';
	});

	protected readonly wizardStepName = computed(() => WIZARD_STEPS[this.wizard()?.step ?? 0]);
	protected readonly wizardTemplate = computed(() => TEMPLATE_LIB.find((t) => t.id === this.wizard()?.template));

	protected readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

	constructor() {
		effect(() => {
			const dialog = this.dialogRef()?.nativeElement;
			if (!dialog) return;
			if (this.dialogView() !== null) {
				if (!dialog.open) dialog.showModal();
			} else if (dialog.open) {
				dialog.close();
			}
		});
	}

	protected flowLabel(a: Automation): string {
		const when = `<span>Коли: <b>${a.when}${a.timing ? ' · ' + a.timing : ''}</b></span>`;
		const cond = a.condition ? `<span class="arrow">→</span><span>Якщо: <b>${a.condition}</b></span>` : '';
		const action = `<span class="arrow">→</span><span>Дія: <b>Надіслати ${a.channel}</b></span>`;
		return when + cond + action;
	}

	protected templateNameOf(id: string | null): string {
		return TEMPLATE_LIB.find((t) => t.id === id)?.name ?? '-';
	}

	protected templateAdded(id: string): boolean {
		return this.automations().some((a) => a.template === id);
	}

	protected setTab(tab: Tab): void {
		this.tab.set(tab);
	}

	protected openHistoryTab(): void {
		this.tab.set('history');
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	protected closeDialog(): void {
		this.dialogView.set(null);
	}

	protected onDialogClick(event: MouseEvent): void {
		const dialog = this.dialogRef()?.nativeElement;
		if (!dialog || event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
		if (!inside) this.closeDialog();
	}

	protected openAutomationPanel(id: number): void {
		this.selectedId.set(id);
	}

	protected closeSidePanel(): void {
		this.selectedId.set(null);
	}

	protected enableRecommended(): void {
		this.automations.update((list) => list.map((a) => ({ ...a, active: true })));
		this.toast('Рекомендовані автоматизації увімкнено');
	}

	protected disableConfirmOpen(id: number): void {
		this.dialogView.set({ kind: 'disable-confirm', id });
	}

	protected confirmDisable(id: number): void {
		this.automations.update((list) => list.map((a) => (a.id === id ? { ...a, active: false } : a)));
		this.closeDialog();
		this.closeSidePanel();
		this.toast('Автоматизацію вимкнено');
	}

	protected enable(id: number): void {
		this.automations.update((list) => list.map((a) => (a.id === id ? { ...a, active: true } : a)));
		this.closeSidePanel();
		this.toast('Автоматизацію увімкнено');
	}

	protected toggle(id: number): void {
		const a = this.automations().find((x) => x.id === id);
		if (!a) return;
		if (a.active) this.disableConfirmOpen(id);
		else {
			this.enable(id);
		}
	}

	protected duplicate(id: number): void {
		const a = this.automations().find((x) => x.id === id);
		if (!a) return;
		const newId = Math.max(...this.automations().map((x) => x.id)) + 1;
		this.automations.update((list) => [
			...list,
			{ ...a, id: newId, name: a.name + ' (копія)', statsToday: 0, statsMonth: 0, history30: { done: 0, ok: 0, fail: 0, scheduled: 0 } },
		]);
		this.closeSidePanel();
		this.toast('Автоматизацію дубльовано');
	}

	protected archive(id: number): void {
		this.automations.update((list) => list.filter((a) => a.id !== id));
		this.closeSidePanel();
		this.toast('Автоматизацію архівовано');
	}

	protected retryHistory(): void {
		this.toast('Спробу повторено · Демо');
	}

	protected addPresetModal(templateId: string): void {
		this.dialogView.set({ kind: 'add-preset', templateId });
	}

	protected confirmPreset(templateId: string): void {
		const t = TEMPLATE_LIB.find((tpl) => tpl.id === templateId);
		if (!t) return;
		const newId = Math.max(...this.automations().map((a) => a.id)) + 1;
		this.automations.update((list) => [
			...list,
			{
				id: newId,
				name: t.name,
				when: 'Створено бронювання',
				timing: null,
				condition: null,
				channel: 'Email',
				template: t.id,
				active: true,
				statsToday: 0,
				statsMonth: 0,
				description: t.text.split('\n')[0],
				history30: { done: 0, ok: 0, fail: 0, scheduled: 0 },
			},
		]);
		this.closeDialog();
		this.toast('Автоматизацію додано та увімкнено');
	}

	protected configurePreset(templateId: string): void {
		this.closeDialog();
		this.newWizard({ template: templateId });
	}

	protected aiCreateModal(): void {
		this.dialogView.set({ kind: 'ai-create' });
	}

	protected submitAiCreate(prompt: string): void {
		const w = aiParsePrompt(prompt);
		this.closeDialog();
		clearTimeout(this._aiTimer);
		this._aiTimer = setTimeout(() => this.newWizard({ ...w, step: 3 }), 50);
	}

	protected editAutomation(id: number): void {
		this.closeSidePanel();
		this.closeDialog();
		const a = this.automations().find((x) => x.id === id);
		if (!a) return;
		this.newWizard({ when: a.when, timing: a.timing, condition: a.condition ?? 'Без додаткових умов', channel: a.channel, template: a.template });
	}

	protected newWizard(prefill?: Partial<WizardState>): void {
		this.wizard.set({
			step: 0,
			when: null,
			timing: null,
			condition: 'Без додаткових умов',
			action: 'message',
			channel: 'Email',
			template: null,
			customText: '',
			...prefill,
		});
		this.dialogView.set({ kind: 'wizard' });
	}

	protected wizardBack(): void {
		this.wizard.update((w) => (w ? { ...w, step: w.step - 1 } : w));
	}

	protected wizardNext(): void {
		this.wizard.update((w) => (w ? { ...w, step: w.step + 1 } : w));
	}

	protected pickWhen(when: string): void {
		this.wizard.update((w) => (w ? { ...w, when, timing: null } : w));
	}

	protected pickTiming(timing: string): void {
		this.wizard.update((w) => (w ? { ...w, timing } : w));
	}

	protected pickCondition(condition: string): void {
		this.wizard.update((w) => (w ? { ...w, condition } : w));
	}

	protected pickAction(action: string): void {
		this.wizard.update((w) => (w ? { ...w, action } : w));
	}

	protected setWizChannel(channel: string): void {
		this.wizard.update((w) => (w ? { ...w, channel } : w));
	}

	protected setWizTemplate(template: string): void {
		this.wizard.update((w) => (w ? { ...w, template: template || null } : w));
	}

	protected setWizTime(time: string): void {
		this.wizard.update((w) => (w ? { ...w, timing: time } : w));
	}

	protected saveWizard(enable: boolean): void {
		const w = this.wizard();
		if (!w) return;
		const name = TEMPLATE_LIB.find((t) => t.id === w.template)?.name ?? w.when ?? 'Створено бронювання';
		const newId = Math.max(...this.automations().map((a) => a.id)) + 1;
		this.automations.update((list) => [
			...list,
			{
				id: newId,
				name,
				when: w.when ?? 'Створено бронювання',
				timing: w.timing,
				condition: w.condition === 'Без додаткових умов' ? null : w.condition,
				channel: w.channel,
				template: w.template,
				active: enable,
				statsToday: 0,
				statsMonth: 0,
				description: 'Нова автоматизація, створена вручну.',
				history30: { done: 0, ok: 0, fail: 0, scheduled: 0 },
			},
		]);
		this.closeDialog();
		this.toast(enable ? 'Автоматизацію увімкнено' : 'Автоматизацію збережено вимкненою');
	}
}
