export const money = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n) + ' ₴';

/** `2026-09-17` as "17 вер." */
export const dayLabel = (iso: string) =>
	iso ? new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T00:00:00Z')) : '';
