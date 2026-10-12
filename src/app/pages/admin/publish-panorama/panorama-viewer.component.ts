import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, signal, viewChild, ViewEncapsulation } from '@angular/core';
import type { Viewer } from '@photo-sphere-viewer/core';

/**
 * Interactive 360° preview (Photo Sphere Viewer). The library and three.js load only in the
 * browser, when the viewer is first shown, so prerendering and other pages stay unaffected.
 * The panorama is shown as stored in the file (the viewer reads its Photo Sphere XMP pose itself).
 */
@Component({
	selector: 'app-panorama-viewer',
	template: `
		<div class="panorama-viewer__stage" #stage></div>
		@if (error()) {
			<p class="panorama-viewer__error" role="alert">{{ error() }}</p>
		}
	`,
	styleUrl: './panorama-viewer.component.scss',
	// The viewer builds its own DOM inside the stage, so its stylesheet must not be scoped.
	encapsulation: ViewEncapsulation.None,
	host: { class: 'panorama-viewer' },
})
export class PanoramaViewerComponent {
	readonly src = input.required<string>();

	protected readonly error = signal('');

	private readonly _stage = viewChild.required<ElementRef<HTMLElement>>('stage');
	private readonly _viewer = signal<Viewer | null>(null);
	private _shownSrc = '';

	constructor() {
		afterNextRender(async () => {
			try {
				const { Viewer } = await import('@photo-sphere-viewer/core');
				this._shownSrc = this.src();
				this._viewer.set(
					new Viewer({
						container: this._stage().nativeElement,
						panorama: this._shownSrc,
						navbar: ['zoom', 'move', 'fullscreen'],
						loadingTxt: 'Завантаження панорами…',
						lang: { zoom: 'Масштаб', zoomIn: 'Наблизити', zoomOut: 'Віддалити', moveUp: 'Вгору', moveDown: 'Вниз', moveLeft: 'Ліворуч', moveRight: 'Праворуч', fullscreen: 'На весь екран' },
					}),
				);
			} catch {
				this.error.set('Не вдалося відкрити 360°-перегляд у цьому браузері.');
			}
		});

		// Switching spots fades into the next panorama, which is also how transitions between neighbours are previewed.
		effect(() => {
			const viewer = this._viewer();
			const src = this.src();
			if (!viewer || src === this._shownSrc) return;
			this._shownSrc = src;
			viewer.setPanorama(src, { transition: { speed: 800, rotation: false } }).catch(() => this.error.set('Не вдалося відкрити панораму.'));
		});

		inject(DestroyRef).onDestroy(() => this._viewer()?.destroy());
	}
}
