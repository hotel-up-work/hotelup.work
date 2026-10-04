import { Service, inject } from '@angular/core';
import {
	addDoc,
	arrayUnion,
	collection,
	doc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	Timestamp,
	updateDoc,
	where,
	type DocumentData,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { FirebaseService } from './firebase.service';

export type SubmissionStatus = 'new' | 'inProgress' | 'booked' | 'closed' | 'spam';

/** What a hotel website sends. Only phone is required from the visitor (see firestore.rules). */
export interface LeadSubmission {
	phone: string;
	/** Stable slug of the form on the site, e.g. "stay-request". Never rename once live. */
	formId: string;
	/** Human label shown in the CRM, e.g. "Запит на проживання". */
	formName?: string;
	/** Page the form lives on (origin + path); a hotel may have several websites. */
	site?: string;
	name?: string;
	email?: string;
	message?: string;
	checkIn?: string;
	checkOut?: string;
	guests?: number;
	roomType?: string;
	/** Service requests (sauna, SPA, events…): the day, optional HH:mm and chosen option. */
	date?: string;
	time?: string;
	service?: string;
	/** Hostels: one entry per guest. */
	genders?: Gender[];
}

export type Gender = 'female' | 'male';

export interface SubmissionHistoryEntry {
	time: string;
	text: string;
}

export interface SubmissionRecord {
	id: string;
	name: string;
	phone: string;
	email: string;
	formId: string;
	formName: string;
	site: string;
	message: string;
	checkIn: string;
	checkOut: string;
	guests: number | null;
	roomType: string;
	date: string;
	time: string;
	service: string;
	genders: Gender[];
	status: SubmissionStatus;
	history: SubmissionHistoryEntry[];
	receivedAt: Date | null;
}

function toSubmission(id: string, data: DocumentData): SubmissionRecord {
	const createdAt = data['createdAt'] as Timestamp | undefined;
	return {
		id,
		name: data['name'] ?? '',
		phone: data['phone'] ?? '',
		email: data['email'] ?? '',
		// `form` is the pre-formId field name, kept so older test submissions still show.
		formId: data['formId'] ?? data['form'] ?? '',
		formName: data['formName'] ?? '',
		site: data['site'] ?? '',
		message: data['message'] ?? '',
		checkIn: data['checkIn'] ?? '',
		checkOut: data['checkOut'] ?? '',
		guests: typeof data['guests'] === 'number' ? data['guests'] : null,
		roomType: data['roomType'] ?? '',
		date: data['date'] ?? '',
		time: data['time'] ?? '',
		service: data['service'] ?? '',
		genders: Array.isArray(data['genders']) ? (data['genders'] as Gender[]) : [],
		status: (data['status'] as SubmissionStatus) ?? 'new',
		history: (data['history'] as SubmissionHistoryEntry[]) ?? [],
		receivedAt: createdAt?.toDate() ?? null,
	};
}

/**
 * Writes visitor-facing form leads to the shared `submissions` Firestore collection
 * (create-only, see firestore.rules) and, for the CRM, lists/updates a single hotel's
 * leads. Every hotel website writes into the same collection tagged with its own `hotelId`
 * (the `hotels/{id}` document id, e.g. "kp-kleopatra"), so each hotel only sees its own leads.
 */
@Service()
export class SubmissionsService {
	private readonly _firebase = inject(FirebaseService);

	async submit(lead: LeadSubmission): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;

		await addDoc(collection(firestore, 'submissions'), {
			...lead,
			hotelId: environment.companyId,
			status: 'new' satisfies SubmissionStatus,
			history: [],
			createdAt: serverTimestamp(),
		});
	}

	/**
	 * Live list of a hotel's submissions, newest first. Returns an unsubscribe function.
	 * Needs the (hotelId, createdAt desc) composite index from firestore.indexes.json.
	 */
	listen(
		hotelId: string,
		onChange: (submissions: SubmissionRecord[]) => void,
		onError: (error: Error) => void = () => {},
	): () => void {
		const firestore = this._firebase.firestore;
		if (!firestore) return () => {};

		const submissionsQuery = query(
			collection(firestore, 'submissions'),
			where('hotelId', '==', hotelId),
			orderBy('createdAt', 'desc'),
		);

		return onSnapshot(submissionsQuery, (snapshot) => {
			onChange(snapshot.docs.map((docSnapshot) => toSubmission(docSnapshot.id, docSnapshot.data())));
		}, onError);
	}

	/** One submission, or null when it does not exist or belongs to another hotel. */
	async get(hotelId: string, id: string): Promise<SubmissionRecord | null> {
		const firestore = this._firebase.firestore;
		if (!firestore) return null;

		const snapshot = await getDoc(doc(firestore, 'submissions', id));
		const data = snapshot.data();
		if (!data || data['hotelId'] !== hotelId) return null;
		return toSubmission(snapshot.id, data);
	}

	async updateStatus(id: string, status: SubmissionStatus, note: string): Promise<void> {
		const firestore = this._firebase.firestore;
		if (!firestore) return;

		await updateDoc(doc(firestore, 'submissions', id), {
			status,
			history: arrayUnion({ time: new Date().toISOString(), text: note } satisfies SubmissionHistoryEntry),
		});
	}
}
