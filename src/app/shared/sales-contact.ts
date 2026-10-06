export interface SalesRequest {
	/** Which form on the site the request came from, shown on the first line of the message. */
	formName: string;
	name: string;
	phone: string;
	email: string;
	hotel: string;
	interest: string;
	message: string;
}

const SITE_NAME = 'hotelup.work';
const CONTACT_API = 'https://it.webart.work/api/telegram/contact';

/** Telegram contact slug of this site on the contact API. */
const CONTACT_SLUG = 'hotel-up-work';

function buildMessage(r: SalesRequest): string {
	return [
		`🏨 Нова заявка з сайту ${SITE_NAME} · форма: ${r.formName}`,
		'',
		r.name && `👤 Ім'я: ${r.name}`,
		r.phone && `📞 Телефон: ${r.phone}`,
		r.email && `📧 Email: ${r.email}`,
		r.hotel && `🏨 Готель: ${r.hotel}`,
		r.interest && `🎯 Цікавить: ${r.interest}`,
		r.message && `💬 Повідомлення: ${r.message}`,
	]
		.filter(Boolean)
		.join('\n');
}

/** Sends the sales request to the Telegram contact API; resolves `true` only on a confirmed delivery. */
export async function sendSalesRequest(request: SalesRequest): Promise<boolean> {
	const response = await fetch(CONTACT_API, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug: CONTACT_SLUG, message: buildMessage(request) }),
	});
	return response.ok && (await response.json()) === true;
}
