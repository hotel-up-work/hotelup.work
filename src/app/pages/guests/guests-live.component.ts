import { Component, DestroyRef, computed, effect, inject, signal, type Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ModalService, type Modal } from '@wawjs/ngx-ui';
import { AppShellComponent } from '../../layouts/app-shell/app-shell.component';
import { BookingRecord, BookingsService } from '../../feature/firebase/bookings.service';
import { GuestInput, GuestRecord, GuestsService, phoneKey, nameKey } from '../../feature/firebase/guests.service';
import { HotelService } from '../../feature/firebase/hotel.service';
import { nightsBetween } from '../../shared/booking-rules';
import { IconComponent } from '../../shared/icon/icon.component';
import { canCurrent } from '../../shared/role';
import { ConfirmComponent } from '../rooms/dialogs/confirm.component';
import type { ModalSave } from '../rooms/rooms.interface';
import { GuestFormComponent } from './dialogs/guest-form.component';
import { GuestMergeComponent, type MergeCandidate } from './dialogs/guest-merge.component';

type Segment = 'all' | 'staying' | 'upcoming' | 'regular' | 'new' | 'away';
type Sort = 'activity' | 'name' | 'stays' | 'paid' | 'visit';
type StatusKey = 'staying' | 'today' | 'upcoming' | 'new' | 'former';

/** A guest with what their bookings say. */
interface GuestView {
	guest: GuestRecord;
	/** Bookings linked to this guest, newest first. */
	bookings: BookingRecord[];
	/** Stays that happened or are happening (checked in or out). */
	stays: number;
	nights: number;
	/** Money received on the guest's bookings that are not cancelled. */
	paid: number;
	lastVisit: string | null;
	nextBooking: string | null;
	nextRoom: string | null;
	staying: boolean;
	status: { key: StatusKey; label: string };
}

const TAGS = ['Постійний гість', 'VIP', 'Бізнес', 'Сім’я'];
const AWAY_DAYS = 180;

const money = (n: number) => new Intl.NumberFormat('uk-UA').format(n) + ' ₴';
const fmt = (iso: string | null) =>
	iso ? new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')) : '';
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Ukrainian plural: 1 проживання, 2 проживання, 5 проживань. */
function plural(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/**
 * Real hotels: the hotel's guests (`hotels/{hotelId}/guests`) with their stays computed from bookings
 * (CRM.md → `guests`). Bookings link to a guest by `guestId`; this page never changes a booking except
 * when merging duplicates or creating guests for older bookings.
 */
@Component({
	selector: 'app-guests-live',
	imports: [AppShellComponent, IconComponent, FormsModule, RouterLink],
	templateUrl: './guests-live.component.html',
	styleUrl: './guests-live.component.scss',
})
export class GuestsLiveComponent {
	private readonly _guestsService = inject(GuestsService);
	private readonly _bookingsService = inject(BookingsService);
	private readonly _hotel = inject(HotelService);
	private readonly _router = inject(Router);
	private readonly _modal = inject(ModalService);
	/** ngx-ui modals opened by this page; closed when the page is left. */
	private readonly _modals = new Set<Modal>();

	protected readonly hotelId = this._hotel.activeHotelId;
	protected readonly hotelSubtitle = computed(() => {
		const hotel = this._hotel.activeHotel();
		if (!hotel) return '';
		return hotel.city ? `${hotel.name} · ${hotel.city}` : hotel.name;
	});

	/** Guest export, merge and deletion are separate capabilities (Owner/Manager by default). */
	protected readonly canBulk = canCurrent('guestBulk');
	/** Money figures only for roles that see guest bills. */
	protected readonly showFinance = canCurrent('guestBill');

	protected readonly money = money;
	protected readonly fmt = fmt;
	protected readonly TAGS = TAGS;
	protected readonly today = localDate(new Date());

	private readonly _guests = signal<GuestRecord[]>([]);
	private readonly _bookings = signal<BookingRecord[]>([]);
	private readonly _guestsLoaded = signal(false);
	private readonly _bookingsLoaded = signal(false);
	protected readonly loadError = signal('');
	protected readonly loading = computed(() => !this._guestsLoaded() || !this._bookingsLoaded());
	protected readonly ready = computed(() => !!this.hotelId() && !this.loading() && !this.loadError());

	protected readonly search = signal('');
	protected readonly segment = signal<Segment>('all');
	protected readonly sort = signal<Sort>('activity');
	protected readonly selectedId = signal<string | null>(null);
	protected readonly saving = signal(false);
	protected readonly toastMessage = signal('');
	private _toastTimer?: ReturnType<typeof setTimeout>;

	protected readonly views = computed<GuestView[]>(() => {
		const known = new Set(this._guests().map((g) => g.id));
		const byGuest = new Map<string, BookingRecord[]>();
		for (const b of this._bookings()) {
			if (!b.guestId || !known.has(b.guestId)) continue;
			byGuest.set(b.guestId, [...(byGuest.get(b.guestId) ?? []), b]);
		}
		const today = this.today;
		return this._guests().map((guest) => {
			const bookings = (byGuest.get(guest.id) ?? []).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
			const stayed = bookings.filter((b) => b.status === 'checkedout' || b.status === 'checkedin');
			const upcoming = bookings
				.filter((b) => (b.status === 'pending' || b.status === 'confirmed') && b.checkOut > today)
				.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
			const staying = bookings.some((b) => b.status === 'checkedin');
			const visits = stayed.map((b) => (b.status === 'checkedin' ? today : b.checkOut)).sort();
			const nextBooking = upcoming[0]?.checkIn ?? null;
			const stays = stayed.length;
			const status: GuestView['status'] = staying
				? { key: 'staying', label: 'У готелі' }
				: nextBooking === today
					? { key: 'today', label: 'Приїжджає сьогодні' }
					: nextBooking
						? stays > 0
							? { key: 'upcoming', label: 'Має бронювання' }
							: { key: 'new', label: 'Новий гість' }
						: stays > 0
							? { key: 'former', label: 'Колишній гість' }
							: { key: 'new', label: 'Новий гість' };
			return {
				guest,
				bookings,
				stays,
				nights: stayed.reduce((sum, b) => sum + nightsBetween(b.checkIn, b.checkOut), 0),
				paid: bookings.filter((b) => b.status !== 'cancelled').reduce((sum, b) => sum + b.paid, 0),
				lastVisit: visits[visits.length - 1] ?? null,
				nextBooking,
				nextRoom: upcoming[0]?.roomNumber ?? null,
				staying,
				status,
			};
		});
	});

	/** Bookings without a guest profile (older ones, or whose guest was deleted). */
	protected readonly unlinkedCount = computed(() => {
		const known = new Set(this._guests().map((g) => g.id));
		return this._bookings().filter((b) => !b.guestId || !known.has(b.guestId)).length;
	});

	protected readonly kpis = computed(() => {
		const views = this.views();
		const month = this.today.slice(0, 7);
		const repeat = views.filter((v) => v.stays >= 2).length;
		return {
			total: views.length,
			newThisMonth: views.filter((v) => v.guest.createdAt && localDate(v.guest.createdAt).slice(0, 7) === month).length,
			repeat,
			repeatShare: views.length ? Math.round((repeat / views.length) * 100) : 0,
			staying: views.filter((v) => v.staying).length,
		};
	});

	protected readonly filtered = computed(() => {
		const q = this.search().trim().toLocaleLowerCase('uk-UA');
		const digits = q.replace(/\D/g, '');
		let list = this.views();
		if (q) {
			list = list.filter(
				(v) =>
					[v.guest.name, v.guest.email, v.guest.phone].some((x) => x.toLocaleLowerCase('uk-UA').includes(q)) ||
					(digits.length >= 3 && v.guest.phone.replace(/\D/g, '').includes(digits)),
			);
		}
		const seg = this.segment();
		const today = this.today;
		if (seg === 'staying') list = list.filter((v) => v.staying);
		else if (seg === 'upcoming') list = list.filter((v) => !!v.nextBooking);
		else if (seg === 'regular') list = list.filter((v) => v.stays >= 2);
		else if (seg === 'new') list = list.filter((v) => v.stays === 0);
		else if (seg === 'away') {
			list = list.filter((v) => v.stays >= 2 && !!v.lastVisit && nightsBetween(v.lastVisit, today) > AWAY_DAYS && !v.nextBooking);
		}
		const sorters: Record<Sort, (a: GuestView, b: GuestView) => number> = {
			activity: (a, b) => (b.nextBooking || b.lastVisit || '').localeCompare(a.nextBooking || a.lastVisit || ''),
			name: (a, b) => a.guest.name.localeCompare(b.guest.name, 'uk'),
			stays: (a, b) => b.stays - a.stays,
			paid: (a, b) => b.paid - a.paid,
			visit: (a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''),
		};
		return [...list].sort(sorters[this.sort()]);
	});

	protected readonly selected = computed(() => this.views().find((v) => v.guest.id === this.selectedId()) ?? null);

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			for (const modal of this._modals) modal.close?.();
		});

		// Re-subscribe whenever the sidebar switches hotel; the previous hotel's listeners are dropped.
		effect((onCleanup) => {
			const hotelId = this.hotelId();
			if (!hotelId) return;
			this._guests.set([]);
			this._bookings.set([]);
			this._guestsLoaded.set(false);
			this._bookingsLoaded.set(false);
			this.loadError.set('');
			this.selectedId.set(null);
			const onError = (error: Error) => {
				// Most often missing rules for hotels/{id}/guests: deploy firestore.rules.
				console.error('Guests listener failed', error);
				this.loadError.set('Не вдалося завантажити гостей. Оновіть сторінку; якщо не допоможе, зверніться до адміністратора.');
			};
			const stopGuests = this._guestsService.listen(
				hotelId,
				(guests) => {
					this._guests.set(guests);
					this._guestsLoaded.set(true);
				},
				onError,
			);
			const stopBookings = this._bookingsService.listen(
				hotelId,
				(bookings) => {
					this._bookings.set(bookings);
					this._bookingsLoaded.set(true);
				},
				onError,
			);
			onCleanup(() => {
				stopGuests();
				stopBookings();
			});
		});
	}

	protected readonly staysLabel = (n: number) => `${n} ${plural(n, 'проживання', 'проживання', 'проживань')}`;
	protected readonly bookingsLabel = (n: number) => `${n} ${plural(n, 'бронювання', 'бронювання', 'бронювань')}`;

	protected bookingStatusLabel(b: BookingRecord): string {
		return { pending: 'Очікує', confirmed: 'Підтверджено', checkedin: 'Заїхав', checkedout: 'Виїхав', cancelled: 'Скасовано' }[b.status];
	}

	protected stay(b: BookingRecord): string {
		return `${fmt(b.checkIn)} – ${fmt(b.checkOut)}`;
	}

	protected open(id: string): void {
		this.selectedId.set(id);
	}

	protected closePanel(): void {
		this.selectedId.set(null);
	}

	protected newBooking(id: string): void {
		this._router.navigate(['/new-booking'], { queryParams: { guest: id } });
	}

	private toast(text: string): void {
		this.toastMessage.set(text);
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => this.toastMessage.set(''), 4200);
	}

	/** Opens an ngx-ui modal in the CRM look; `props` become the component's fields. */
	private _open(component: Type<unknown>, props: Record<string, unknown>, size: Modal['size'] = 'mid'): Modal {
		const modal = this._modal.show({
			component,
			size,
			panelClass: 'crm-modal',
			label: 'ГОСТІ',
			onClose: () => this._modals.delete(modal),
			...props,
		});
		this._modals.add(modal);
		return modal;
	}

	/** The error to show in the form when this phone or (without a phone) name already belongs to another guest. */
	private _duplicateOf(input: GuestInput, exceptId?: string): string | null {
		const key = phoneKey(input.phone);
		const others = this._guests().filter((g) => g.id !== exceptId);
		const same = key ? others.find((g) => phoneKey(g.phone) === key) : others.find((g) => !phoneKey(g.phone) && nameKey(g.name) === nameKey(input.name));
		return same ? `Такий гість уже є: ${same.name}${same.phone ? ' · ' + same.phone : ''}. Відкрийте його профіль або обʼєднайте дублікати.` : null;
	}

	protected openAdd(): void {
		if (!this.ready()) return;
		this._open(GuestFormComponent, {
			guest: null,
			tagOptions: TAGS,
			save: async (input: GuestInput): Promise<string | null> => {
				const duplicate = this._duplicateOf(input);
				if (duplicate) return duplicate;
				return this._write(async () => {
					const id = await this._guestsService.add(this.hotelId()!, input);
					this.selectedId.set(id);
				}, `Гостя «${input.name.trim()}» додано`);
			},
		});
	}

	protected openEdit(id: string): void {
		const guest = this._guests().find((g) => g.id === id);
		if (!guest) return;
		this._open(GuestFormComponent, {
			guest,
			tagOptions: TAGS,
			save: async (input: GuestInput): Promise<string | null> => {
				const duplicate = this._duplicateOf(input, id);
				if (duplicate) return duplicate;
				return this._write(() => this._guestsService.update(this.hotelId()!, id, input), 'Зміни збережено');
			},
		});
	}

	protected openMerge(id: string): void {
		const guest = this._guests().find((g) => g.id === id);
		if (!guest || !this.canBulk) return;
		const counts = new Map<string, number>();
		for (const b of this._bookings()) if (b.guestId) counts.set(b.guestId, (counts.get(b.guestId) ?? 0) + 1);
		const key = phoneKey(guest.phone);
		const candidates: MergeCandidate[] = this._guests()
			.filter((g) => g.id !== id)
			.map((other) => ({
				guest: other,
				bookings: counts.get(other.id) ?? 0,
				likely: (!!key && phoneKey(other.phone) === key) || nameKey(other.name) === nameKey(guest.name),
			}))
			.sort((a, b) => Number(b.likely) - Number(a.likely) || a.guest.name.localeCompare(b.guest.name, 'uk'));
		this._open(GuestMergeComponent, {
			guest,
			candidates,
			save: async (otherId: string): Promise<string | null> => {
				const drop = this._guests().find((g) => g.id === otherId);
				if (!drop) return 'Гостя не знайдено. Можливо, його вже видалили.';
				return this._write(() => this._guestsService.merge(this.hotelId()!, guest, drop, this._bookings()), `«${drop.name}» обʼєднано з «${guest.name}»`);
			},
		});
	}

	protected openDelete(id: string): void {
		const view = this.views().find((v) => v.guest.id === id);
		if (!view || !this.canBulk) return;
		const withHistory = view.bookings.length > 0;
		const confirm: ModalSave<void> = async () =>
			this._write(async () => {
				await this._guestsService.delete(this.hotelId()!, id);
				this.closePanel();
			}, `Гостя «${view.guest.name}» видалено`);
		this._open(
			ConfirmComponent,
			{
				title: `Видалити гостя «${view.guest.name}»?`,
				text: withHistory
					? `Профіль зникне зі списку. Його бронювання (${view.bookings.length}) залишаться в календарі, але більше не будуть привʼязані до гостя. Цю дію не можна скасувати.`
					: 'Профіль зникне зі списку. Цю дію не можна скасувати.',
				confirmText: 'Видалити',
				confirm,
			},
			'small',
		);
	}

	/** Runs a write; shows `success` as a toast and returns null, or returns the error to show in the form. */
	private async _write(action: () => Promise<void>, success: string): Promise<string | null> {
		if (!this.hotelId()) return 'Готель не вибрано.';
		this.saving.set(true);
		try {
			await action();
			if (success) this.toast(success);
			return null;
		} catch (error) {
			console.error('Guests write failed', error);
			return 'Не вдалося зберегти зміни. Перевірте зʼєднання та спробуйте ще раз.';
		} finally {
			this.saving.set(false);
		}
	}

	protected async importFromBookings(): Promise<void> {
		if (!this.ready() || this.saving()) return;
		const error = await this._write(async () => {
			const created = await this._guestsService.importFromBookings(this.hotelId()!, this._guests(), this._bookings());
			this.toast(created ? `Створено профілів: ${created}` : 'Бронювання привʼязано до наявних гостей');
		}, '');
		if (error) this.toast(error);
	}

	protected exportCsv(): void {
		if (!this.canBulk) return;
		const header = ['Імʼя', 'Телефон', 'Email', 'Теги', 'Проживань', 'Ночей', ...(this.showFinance ? ['Оплачено, ₴'] : []), 'Останній візит', 'Наступне бронювання', 'Нотатки'];
		const rows = this.filtered().map((v) => [
			v.guest.name,
			v.guest.phone,
			v.guest.email,
			v.guest.tags.join('; '),
			v.stays,
			v.nights,
			...(this.showFinance ? [v.paid] : []),
			v.lastVisit ?? '',
			v.nextBooking ?? '',
			v.guest.notes.replace(/\s*\n\s*/g, ' '),
		]);
		const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `guests-${this.today}.csv`;
		link.click();
		URL.revokeObjectURL(url);
		this.toast(`Експортовано гостей: ${rows.length}`);
	}
}
