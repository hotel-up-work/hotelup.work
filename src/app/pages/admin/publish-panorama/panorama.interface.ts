/**
 * Street View publishing data (CRM.md → Admin pages → Publish panorama). The tour (spots, floors,
 * connections) is ours and does not depend on Google, so the hotel's own virtual tour can reuse it;
 * Google's side is kept apart in `GooglePublication`.
 */

/** Camera orientation in degrees: heading 0–360 from north, pitch and roll −90…90. */
export interface PanoramaPose {
	heading: number;
	pitch: number;
	roll: number;
}

/** Photo Sphere XMP (GPano) values found in the original JPEG. */
export interface PanoramaXmp {
	projection: string | null;
	fullWidth: number | null;
	fullHeight: number | null;
	croppedWidth: number | null;
	croppedHeight: number | null;
	heading: number | null;
	pitch: number | null;
	roll: number | null;
}

export interface PanoramaIssue {
	level: 'error' | 'warning';
	text: string;
}

export type GoogleStatus = 'draft' | 'uploading' | 'processing' | 'published' | 'rejected' | 'failed';

/** What Google returned for one spot; kept so later updates reuse the same photo instead of publishing a duplicate. */
export interface GooglePublication {
	status: GoogleStatus;
	photoId: string | null;
	shareLink: string | null;
	syncedAt: string | null;
	error: string | null;
}

/** One 360° panorama and where it stands in the tour. */
export interface PanoramaSpot {
	id: string;
	/** Shown on the floor plan and in lists; stays fixed when other spots are deleted. */
	number: number;
	name: string;
	/** The original file, never re-encoded: Google gets these exact bytes. */
	file: File;
	/** Object URL of the original for the 360° viewer. */
	url: string;
	/** Small data-URL preview for lists. */
	thumbnail: string;
	width: number;
	height: number;
	xmp: PanoramaXmp | null;
	/** Problems with the file itself; metadata problems are checked separately as they change. */
	fileIssues: PanoramaIssue[];
	lat: number | null;
	lng: number | null;
	floor: number;
	pose: PanoramaPose;
	/** Position on the floor plan, 0–1 of its width and height; null until placed. */
	plan: { x: number; y: number } | null;
	google: GooglePublication;
}

export interface TourFloor {
	level: number;
	label: string;
	/** Object URL of the uploaded floor-plan image. */
	planUrl: string | null;
}

/** A walkable link between two spots. Stored once and always used both ways. */
export interface TourConnection {
	a: string;
	b: string;
}

export interface StreetViewConfig {
	/** Google Maps Place ID of the hotel the photos are published to. */
	placeId: string;
	/** Connected Google account; the token itself never reaches the browser. */
	account: { email: string } | null;
}
