import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';

/**
 * Marks a booking block's name line `tight` when the full name does not fit its width, so the template's
 * surname-first variant shows instead (cut with "…"). Re-checks when the block is resized (day count,
 * density, window) and when the name changes. Browser only; prerender keeps the full name.
 */
@Directive({ selector: '[appFitName]' })
export class FitNameDirective {
	/** The name shown; a change re-measures. */
	readonly appFitName = input('');

	private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef);
	private _observer?: ResizeObserver;

	constructor() {
		afterNextRender(() => {
			this._observer = new ResizeObserver(() => this._check());
			this._observer.observe(this._el.nativeElement);
			this._check();
			// The web font changes text width without resizing the block: measure again once it is in.
			void document.fonts?.ready.then(() => this._check());
		});
		effect(() => {
			this.appFitName();
			if (this._observer) requestAnimationFrame(() => this._check());
		});
		inject(DestroyRef).onDestroy(() => this._observer?.disconnect());
	}

	/** Measure with the full name showing; switch to the short form only when it overflows. */
	private _check(): void {
		const line = this._el.nativeElement;
		line.classList.remove('tight');
		if (line.scrollWidth > line.clientWidth) line.classList.add('tight');
	}
}
