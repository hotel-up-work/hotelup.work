import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { PROPOSAL_HOTELS } from './pages/proposal/proposal-hotels';

/** The signed-in app. The demo version of each page is prerendered (the server has no session, so it renders the demo). */
const PROTECTED_PATHS = [
	'dashboard',
	'calendar',
	'submissions',
	'guests',
	'rooms',
	'payments',
	'housekeeping',
	'messages',
	'automations',
	'sales',
	'ai',
	'team',
	'settings',
	'search',
	'notifications',
	'profile',
	'guest',
	'new-booking',
	'booking',
	'book',
];

export const serverRoutes: ServerRoute[] = [
	...PROTECTED_PATHS.map(
		(path): ServerRoute => ({
			path,
			renderMode: RenderMode.Prerender,
		}),
	),
	// After 'settings': real-account settings sections only exist for live sessions, so there is nothing to prerender.
	{ path: 'settings/**', renderMode: RenderMode.Client },
	{
		path: 'proposal/:slug',
		renderMode: RenderMode.Prerender,
		fallback: PrerenderFallback.Client,
		getPrerenderParams: async () => PROPOSAL_HOTELS.map(({ slug }) => ({ slug })),
	},
	{
		path: '**',
		renderMode: RenderMode.Prerender,
	},
];
