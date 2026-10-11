import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RELEASE_STATUS_LABEL, RELEASES } from './roadmap.data';

@Component({
	selector: 'app-roadmap',
	imports: [RouterLink],
	templateUrl: './roadmap.component.html',
	styleUrl: './roadmap.component.scss',
})
export class RoadmapComponent {
	protected readonly releases = RELEASES;
	protected readonly statusLabel = RELEASE_STATUS_LABEL;

	protected readonly activeKey = signal(RELEASES[0].key);
	protected readonly active = computed(() => RELEASES.find((r) => r.key === this.activeKey()) ?? RELEASES[0]);

	/** Release number → name, to name the releases one depends on. */
	protected readonly releaseName = Object.fromEntries(RELEASES.map((r) => [r.number, r.name])) as Record<string, string>;

	protected openRelease(number: string): void {
		const release = RELEASES.find((r) => r.number === number);
		if (release) this.activeKey.set(release.key);
	}

	protected itemCount(key: string): number {
		const release = RELEASES.find((r) => r.key === key);
		return release ? release.groups.reduce((sum, g) => sum + g.items.length, 0) : 0;
	}

	/** Arrow keys move between tabs, as in the WAI-ARIA tabs pattern. */
	protected onTabKey(event: KeyboardEvent): void {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const index = RELEASES.findIndex((r) => r.key === this.activeKey());
		const next = RELEASES[(index + step + RELEASES.length) % RELEASES.length];
		this.activeKey.set(next.key);
		(event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#tab-${next.key}`)?.focus();
	}
}
