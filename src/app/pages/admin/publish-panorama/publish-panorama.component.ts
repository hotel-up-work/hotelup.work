import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ModalService } from '@wawjs/ngx-ui';
import { HotelService } from '../../../feature/firebase/hotel.service';
import { AppShellComponent } from '../../../layouts/app-shell/app-shell.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ConfirmComponent } from '../../crm/rooms/dialogs/confirm.component';
import { metadataIssues, MIN_MEGAPIXELS, readPanoramaFile, tourIssues } from './panorama-file';
import { PanoramaViewerComponent } from './panorama-viewer.component';
import type { GoogleStatus, PanoramaIssue, PanoramaPose, PanoramaSpot, StreetViewConfig, TourConnection, TourFloor } from './panorama.interface';

type Tab = 'panoramas' | 'tour' | 'google';

const TABS: { key: Tab; label: string }[] = [
	{ key: 'panoramas', label: 'Панорами' },
	{ key: 'tour', label: 'Редактор туру' },
	{ key: 'google', label: 'Публікація в Google' },
];

const GOOGLE_STATUS_LABEL: Record<GoogleStatus, string> = {
	draft: 'Не опубліковано',
	uploading: 'Завантаження',
	processing: 'Google обробляє',
	published: 'Опубліковано',
	rejected: 'Відхилено Google',
	failed: 'Помилка',
};

/** Google Maps Place IDs are long URL-safe tokens (usually starting with "ChIJ"). */
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

/** "48.6789, 26.5851", as Google Maps copies coordinates. */
const COORDS_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Admin → Street View (CRM.md → Admin pages → Publish panorama). Uploads and checks 360° photos,
 * builds the walkable tour between them and prepares publishing to Google Street View.
 * Publishing itself needs the Hotel Upwork server (Google OAuth tokens never live in the browser),
 * which is not built yet, so the page keeps its work in memory and the publish action stays disabled.
 */
@Component({
	selector: 'app-publish-panorama',
	imports: [AppShellComponent, IconComponent, PanoramaViewerComponent],
	templateUrl: './publish-panorama.component.html',
	styleUrl: './publish-panorama.component.scss',
})
export class PublishPanoramaComponent {
	private readonly _hotel = inject(HotelService);
	private readonly _modal = inject(ModalService);

	protected readonly TABS = TABS;
	protected readonly GOOGLE_STATUS_LABEL = GOOGLE_STATUS_LABEL;
	protected readonly MIN_MEGAPIXELS = MIN_MEGAPIXELS;
	protected readonly SCOPE = 'https://www.googleapis.com/auth/streetviewpublish';

	protected readonly hotelName = computed(() => this._hotel.activeHotel()?.name ?? 'Grand Hotel');

	protected readonly tab = signal<Tab>('panoramas');
	protected readonly spots = signal<PanoramaSpot[]>([]);
	protected readonly floors = signal<TourFloor[]>([{ level: 1, label: '1 поверх', planUrl: null }]);
	protected readonly connections = signal<TourConnection[]>([]);
	protected readonly config = signal<StreetViewConfig>({ placeId: '', account: null });
	protected readonly selectedId = signal<string | null>(null);
	protected readonly activeFloor = signal(1);
	/** Files still being read; shown as local upload progress. */
	protected readonly processing = signal(0);
	protected readonly dragOver = signal(false);
	/** Coordinates the admin typed but that could not be parsed, per spot. */
	protected readonly coordsError = signal<Record<string, string>>({});

	private _nextNumber = 1;

	protected readonly selected = computed(() => this.spots().find((spot) => spot.id === this.selectedId()) ?? null);
	protected readonly floorSpots = computed(() => this.spots().filter((spot) => spot.floor === this.activeFloor()));
	protected readonly currentFloor = computed(() => this.floors().find((floor) => floor.level === this.activeFloor()) ?? this.floors()[0]);

	protected readonly neighbourIds = computed(() => {
		const map = new Map<string, string[]>();
		for (const { a, b } of this.connections()) {
			map.set(a, [...(map.get(a) ?? []), b]);
			map.set(b, [...(map.get(b) ?? []), a]);
		}
		return map;
	});

	protected readonly selectedNeighbours = computed(() => {
		const id = this.selectedId();
		const ids = id ? (this.neighbourIds().get(id) ?? []) : [];
		return this.spots().filter((spot) => ids.includes(spot.id));
	});

	protected readonly issuesById = computed(() => {
		const total = this.spots().length;
		const map = new Map<string, PanoramaIssue[]>();
		for (const spot of this.spots()) {
			map.set(spot.id, [...spot.fileIssues, ...metadataIssues(spot, this.neighbourIds().get(spot.id)?.length ?? 0, total)]);
		}
		return map;
	});

	protected readonly tourProblems = computed(() => tourIssues(this.spots(), this.connections()));

	/** Lines between placed spots on the active floor, in percent of the plan. */
	protected readonly planLines = computed(() => {
		const byId = new Map(this.floorSpots().map((spot) => [spot.id, spot]));
		return this.connections().flatMap(({ a, b }) => {
			const from = byId.get(a)?.plan;
			const to = byId.get(b)?.plan;
			return from && to ? [{ key: `${a}-${b}`, x1: from.x * 100, y1: from.y * 100, x2: to.x * 100, y2: to.y * 100 }] : [];
		});
	});

	protected readonly placeIdValid = computed(() => PLACE_ID_PATTERN.test(this.config().placeId.trim()));

	protected readonly checklist = computed(() => {
		const spots = this.spots();
		const withErrors = spots.filter((spot) => this.errorCount(spot.id) > 0).length;
		return [
			{ done: !!this.config().account, text: 'Google-акаунт підключено' },
			{ done: this.placeIdValid(), text: 'Вказано Place ID готелю' },
			{ done: spots.length > 0, text: 'Завантажено хоча б одну панораму' },
			{ done: spots.length > 0 && withErrors === 0, text: withErrors ? `Виправлено помилки (залишилось у ${withErrors})` : 'Панорами без помилок' },
			{ done: spots.length < 2 || this.tourProblems().length === 0, text: 'Тур без попереджень' },
		];
	});

	protected readonly canPublish = computed(() => this.checklist().every((item) => item.done));

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			for (const spot of this.spots()) URL.revokeObjectURL(spot.url);
			for (const floor of this.floors()) if (floor.planUrl) URL.revokeObjectURL(floor.planUrl);
		});
	}

	protected errorCount(id: string): number {
		return this.issuesById().get(id)?.filter((issue) => issue.level === 'error').length ?? 0;
	}

	protected warningCount(id: string): number {
		return this.issuesById().get(id)?.filter((issue) => issue.level === 'warning').length ?? 0;
	}

	protected connectionCount(id: string): number {
		return this.neighbourIds().get(id)?.length ?? 0;
	}

	protected floorLabel(level: number): string {
		return this.floors().find((floor) => floor.level === level)?.label ?? `${level} поверх`;
	}

	protected isConnected(a: string, b: string): boolean {
		return this.neighbourIds().get(a)?.includes(b) ?? false;
	}

	protected coordsText(spot: PanoramaSpot): string {
		return spot.lat === null || spot.lng === null ? '' : `${spot.lat}, ${spot.lng}`;
	}

	/** Opens the spot's position in Google Maps Street View. */
	protected streetViewLink(spot: PanoramaSpot): string {
		return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
	}

	protected placeLink(): string {
		return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(this.config().placeId.trim())}`;
	}

	// ---- Upload ----

	protected onDragOver(event: DragEvent): void {
		event.preventDefault();
		this.dragOver.set(true);
	}

	protected onDrop(event: DragEvent): void {
		event.preventDefault();
		this.dragOver.set(false);
		if (event.dataTransfer?.files.length) this.addFiles(event.dataTransfer.files);
	}

	protected onFilesPicked(input: HTMLInputElement): void {
		if (input.files?.length) this.addFiles(input.files);
		input.value = '';
	}

	private async addFiles(files: FileList): Promise<void> {
		const list = Array.from(files);
		this.processing.update((count) => count + list.length);
		for (const file of list) {
			try {
				const info = await readPanoramaFile(file);
				const number = this._nextNumber++;
				const spot: PanoramaSpot = {
					id: crypto.randomUUID(),
					number,
					name: file.name.replace(/\.[^.]+$/, '') || `Точка ${number}`,
					file,
					url: URL.createObjectURL(file),
					thumbnail: info.thumbnail,
					width: info.width,
					height: info.height,
					xmp: info.xmp,
					fileIssues: info.issues,
					lat: null,
					lng: null,
					floor: this.activeFloor(),
					pose: { heading: info.xmp?.heading ?? 0, pitch: info.xmp?.pitch ?? 0, roll: info.xmp?.roll ?? 0 },
					plan: null,
					google: { status: 'draft', photoId: null, shareLink: null, syncedAt: null, error: null },
				};
				this.spots.update((spots) => [...spots, spot]);
				if (!this.selectedId()) this.selectedId.set(spot.id);
			} finally {
				this.processing.update((count) => count - 1);
			}
		}
	}

	// ---- Spot metadata ----

	protected select(id: string): void {
		this.selectedId.set(id);
	}

	protected rename(id: string, name: string): void {
		this._patch(id, { name });
	}

	protected setFloor(id: string, level: number): void {
		// A spot moved to another floor loses its place on the old floor plan.
		this._patch(id, { floor: level, plan: null });
	}

	protected setCoords(id: string, text: string): void {
		const errors = { ...this.coordsError() };
		delete errors[id];
		if (!text.trim()) {
			this._patch(id, { lat: null, lng: null });
		} else {
			const match = text.match(COORDS_PATTERN);
			if (match) this._patch(id, { lat: Number(match[1]), lng: Number(match[2]) });
			else errors[id] = 'Формат: 48.6789, 26.5851 (як копіює Google Карти).';
		}
		this.coordsError.set(errors);
	}

	protected setPose(id: string, key: keyof PanoramaPose, value: number): void {
		if (!Number.isFinite(value)) return;
		const spot = this.spots().find((item) => item.id === id);
		if (spot) this._patch(id, { pose: { ...spot.pose, [key]: value } });
	}

	protected confirmRemove(spot: PanoramaSpot): void {
		this._modal.show({
			component: ConfirmComponent,
			size: 'small',
			panelClass: 'crm-modal',
			label: 'Панорами Street View',
			title: `Видалити «${spot.name}»?`,
			text: 'Панорама та її з’єднання зникнуть із туру. Опубліковані в Google фото це не видаляє.',
			confirmText: 'Видалити',
			confirm: async () => {
				this._remove(spot.id);
				return null;
			},
		});
	}

	private _remove(id: string): void {
		const spot = this.spots().find((item) => item.id === id);
		if (spot) URL.revokeObjectURL(spot.url);
		this.spots.update((spots) => spots.filter((item) => item.id !== id));
		this.connections.update((links) => links.filter((link) => link.a !== id && link.b !== id));
		if (this.selectedId() === id) this.selectedId.set(this.spots()[0]?.id ?? null);
	}

	private _patch(id: string, patch: Partial<PanoramaSpot>): void {
		this.spots.update((spots) => spots.map((spot) => (spot.id === id ? { ...spot, ...patch } : spot)));
	}

	// ---- Tour ----

	/** Connections are two-way by design: one link lets Street View walk in both directions. */
	protected toggleConnection(a: string, b: string): void {
		if (a === b) return;
		if (this.isConnected(a, b)) {
			this.connections.update((links) => links.filter((link) => !((link.a === a && link.b === b) || (link.a === b && link.b === a))));
		} else {
			this.connections.update((links) => [...links, { a, b }]);
		}
	}

	protected addFloor(): void {
		const level = Math.max(...this.floors().map((floor) => floor.level)) + 1;
		this.floors.update((floors) => [...floors, { level, label: `${level} поверх`, planUrl: null }]);
		this.activeFloor.set(level);
	}

	protected renameFloor(level: number, label: string): void {
		this.floors.update((floors) => floors.map((floor) => (floor.level === level ? { ...floor, label: label.trim() || `${level} поверх` } : floor)));
	}

	protected onPlanPicked(input: HTMLInputElement): void {
		const file = input.files?.[0];
		input.value = '';
		if (!file || !file.type.startsWith('image/')) return;
		const level = this.activeFloor();
		this.floors.update((floors) =>
			floors.map((floor) => {
				if (floor.level !== level) return floor;
				if (floor.planUrl) URL.revokeObjectURL(floor.planUrl);
				return { ...floor, planUrl: URL.createObjectURL(file) };
			}),
		);
	}

	/** Clicking the plan puts the selected spot there (moving it to this floor if needed). */
	protected placeSelected(event: MouseEvent, canvas: HTMLElement): void {
		const spot = this.selected();
		if (!spot) return;
		const rect = canvas.getBoundingClientRect();
		const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
		this._patch(spot.id, { floor: this.activeFloor(), plan: { x, y } });
	}

	// ---- Google ----

	protected setPlaceId(placeId: string): void {
		this.config.update((config) => ({ ...config, placeId: placeId.trim() }));
	}
}
