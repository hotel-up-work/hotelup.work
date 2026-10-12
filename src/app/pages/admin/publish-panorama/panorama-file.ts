import type { PanoramaIssue, PanoramaSpot, PanoramaXmp, TourConnection } from './panorama.interface';

/** Google Street View accepts equirectangular 360° photos of at least 7.5 MP with a 2:1 ratio. */
export const MIN_MEGAPIXELS = 7.5;
const RATIO_TOLERANCE = 0.01;
/** XMP sits in an APP1 segment near the start of the file; this is enough to find it. */
const HEADER_BYTES = 512 * 1024;
const THUMB_WIDTH = 480;
/** Neighbouring spots further apart than this are probably on wrong coordinates. */
const MAX_NEIGHBOUR_METERS = 100;

export interface PanoramaFileInfo {
	width: number;
	height: number;
	xmp: PanoramaXmp | null;
	thumbnail: string;
	issues: PanoramaIssue[];
}

/** Reads size and Photo Sphere metadata and makes a preview. The file itself is not changed or re-encoded. */
export async function readPanoramaFile(file: File): Promise<PanoramaFileInfo> {
	const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
	const issues: PanoramaIssue[] = [];

	if (header[0] !== 0xff || header[1] !== 0xd8) {
		return { width: 0, height: 0, xmp: null, thumbnail: '', issues: [{ level: 'error', text: 'Це не JPEG. Google приймає панорами лише у форматі JPEG.' }] };
	}

	const size = jpegSize(header);
	const xmp = readXmp(header);
	const thumbnail = await makeThumbnail(file).catch(() => '');
	const width = size?.width ?? 0;
	const height = size?.height ?? 0;

	if (!width || !height) {
		issues.push({ level: 'error', text: 'Не вдалося прочитати розмір зображення.' });
	} else {
		if (Math.abs(width / height - 2) > RATIO_TOLERANCE) {
			issues.push({ level: 'error', text: `Співвідношення сторін ${width}×${height} — не 2:1. Потрібна повна сферична панорама.` });
		}
		const megapixels = (width * height) / 1_000_000;
		if (megapixels < MIN_MEGAPIXELS) {
			issues.push({ level: 'error', text: `${megapixels.toFixed(1)} Мп — замало. Google вимагає щонайменше ${MIN_MEGAPIXELS} Мп.` });
		}
	}

	if (!xmp) {
		issues.push({ level: 'warning', text: 'Немає метаданих Photo Sphere (XMP). Без них Google може не розпізнати панораму.' });
	} else {
		if (xmp.projection && xmp.projection.toLowerCase() !== 'equirectangular') {
			issues.push({ level: 'error', text: `Проєкція «${xmp.projection}» не підтримується. Потрібна equirectangular.` });
		}
		const cropped =
			(xmp.croppedWidth !== null && xmp.fullWidth !== null && xmp.croppedWidth < xmp.fullWidth) ||
			(xmp.croppedHeight !== null && xmp.fullHeight !== null && xmp.croppedHeight < xmp.fullHeight);
		if (cropped) issues.push({ level: 'error', text: 'Панорама обрізана й не охоплює повну сферу 360°×180°.' });
	}

	return { width, height, xmp, thumbnail, issues };
}

/** Problems with what the admin entered; re-checked whenever a spot changes. */
export function metadataIssues(spot: PanoramaSpot, connectionCount: number, spotCount: number): PanoramaIssue[] {
	const issues: PanoramaIssue[] = [];
	if (!spot.name.trim()) issues.push({ level: 'error', text: 'Вкажіть назву точки.' });
	if (spot.lat === null || spot.lng === null) {
		issues.push({ level: 'error', text: 'Вкажіть координати точки.' });
	} else if (Math.abs(spot.lat) > 90 || Math.abs(spot.lng) > 180) {
		issues.push({ level: 'error', text: 'Координати поза допустимими межами.' });
	}
	const { heading, pitch, roll } = spot.pose;
	if (heading < 0 || heading >= 360) issues.push({ level: 'error', text: 'Напрямок має бути від 0 до 359,9°.' });
	if (Math.abs(pitch) > 90 || Math.abs(roll) > 90) issues.push({ level: 'error', text: 'Нахил і крен мають бути від −90 до 90°.' });
	if (spotCount > 1 && connectionCount === 0) issues.push({ level: 'warning', text: 'Точка не з’єднана з жодною іншою.' });
	return issues;
}

/** Tour-wide checks: everything reachable from the first spot, neighbours close enough to walk between. */
export function tourIssues(spots: PanoramaSpot[], connections: TourConnection[]): PanoramaIssue[] {
	const issues: PanoramaIssue[] = [];
	if (spots.length < 2) return issues;

	const byId = new Map(spots.map((spot) => [spot.id, spot]));
	const reached = new Set([spots[0].id]);
	const queue = [spots[0].id];
	while (queue.length) {
		const id = queue.shift()!;
		for (const link of connections) {
			const next = link.a === id ? link.b : link.b === id ? link.a : null;
			if (next && !reached.has(next)) {
				reached.add(next);
				queue.push(next);
			}
		}
	}
	const unreachable = spots.filter((spot) => !reached.has(spot.id));
	if (unreachable.length) {
		issues.push({ level: 'warning', text: `До точок ${unreachable.map((spot) => spot.number).join(', ')} не можна дійти від точки ${spots[0].number}.` });
	}

	for (const link of connections) {
		const a = byId.get(link.a);
		const b = byId.get(link.b);
		if (!a || !b || a.lat === null || a.lng === null || b.lat === null || b.lng === null) continue;
		const meters = distanceMeters(a.lat, a.lng, b.lat, b.lng);
		if (meters > MAX_NEIGHBOUR_METERS) {
			issues.push({ level: 'warning', text: `Точки ${a.number} і ${b.number} з’єднані, але між ними ${Math.round(meters)} м. Перевірте координати.` });
		}
	}
	return issues;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLng = (lng2 - lng1) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Width and height from the JPEG frame header (SOF marker), without decoding the image. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
	let offset = 2;
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) return null;
		const marker = bytes[offset + 1];
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrame) {
			return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
		}
		offset += 2 + length;
	}
	return null;
}

function readXmp(bytes: Uint8Array): PanoramaXmp | null {
	const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
	const start = text.indexOf('<x:xmpmeta');
	const end = text.indexOf('</x:xmpmeta>', start);
	if (start < 0 || end < 0) return null;
	const xml = text.slice(start, end);
	if (!xml.includes('GPano:')) return null;

	// GPano values come either as attributes (GPano:Name="1") or as elements (<GPano:Name>1</GPano:Name>).
	const value = (name: string): string | null => {
		const match = xml.match(new RegExp(`GPano:${name}\\s*=\\s*"([^"]*)"`)) ?? xml.match(new RegExp(`<GPano:${name}>([^<]*)</GPano:${name}>`));
		return match ? match[1].trim() : null;
	};
	const number = (name: string): number | null => {
		const raw = value(name);
		const parsed = raw === null ? NaN : Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	};

	return {
		projection: value('ProjectionType'),
		fullWidth: number('FullPanoWidthPixels'),
		fullHeight: number('FullPanoHeightPixels'),
		croppedWidth: number('CroppedAreaImageWidthPixels'),
		croppedHeight: number('CroppedAreaImageHeightPixels'),
		heading: number('PoseHeadingDegrees'),
		pitch: number('PosePitchDegrees'),
		roll: number('PoseRollDegrees'),
	};
}

async function makeThumbnail(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file, { resizeWidth: THUMB_WIDTH, resizeHeight: THUMB_WIDTH / 2, resizeQuality: 'medium' });
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	bitmap.close();
	return canvas.toDataURL('image/jpeg', 0.8);
}
