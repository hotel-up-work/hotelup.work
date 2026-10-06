export interface SalesRequest {
	name: string;
	phone: string;
	email: string;
	hotel: string;
	interest: string;
	message: string;
}

/**
 * Telegram contact API endpoint for the sales form. Empty until the API is connected:
 * while empty, `sendSalesRequest` does nothing and reports failure, so the form never
 * claims a request was delivered.
 */
const SALES_CONTACT_ENDPOINT = '';

/** Sends the sales request to the Telegram contact API; resolves `true` only on a confirmed delivery. */
export async function sendSalesRequest(request: SalesRequest): Promise<boolean> {
	if (!SALES_CONTACT_ENDPOINT) return false;
	// TODO: connect the Telegram contact API (payload format and auth are still to be agreed).
	const response = await fetch(SALES_CONTACT_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
	});
	return response.ok;
}
