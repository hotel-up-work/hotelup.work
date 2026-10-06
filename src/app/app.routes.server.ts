import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import { PROPOSAL_HOTELS } from './pages/proposal/proposal-hotels';

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
	'settings/**',
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
			renderMode: RenderMode.Client,
		}),
	),
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
