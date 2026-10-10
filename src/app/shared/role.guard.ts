import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getStoredPlan, planIncludes } from './plan';
import { defaultPageFor, getSessionRole, isLiveSession, isPageAllowed, LIVE_PAGES } from './role';

/**
 * Real hotels manage rooms inside Settings (a one-time setup), so the old Rooms route and every link to it
 * land on that tab. The demo keeps its own Rooms page.
 */
export const roomsMovedGuard: CanActivateFn = () => {
	if (!isPlatformBrowser(inject(PLATFORM_ID)) || !isLiveSession()) return true;
	return inject(Router).createUrlTree(['/settings', 'rooms']);
};

export const roleGuard: CanActivateFn = (route) => {
	const platformId = inject(PLATFORM_ID);
	if (!isPlatformBrowser(platformId)) return true;

	const router = inject(Router);
	const role = getSessionRole();
	if (!role) return router.parseUrl('/demo');

	const path = route.routeConfig?.path ?? '';

	// Real accounts only get pages backed by real data; the rest are demo-only for now.
	if (isLiveSession()) {
		if (LIVE_PAGES.includes(path)) return true;
		return router.createUrlTree(['/' + LIVE_PAGES[0]], { queryParams: { soon: path } });
	}

	const plan = getStoredPlan();
	const home = defaultPageFor(role, plan);
	if (!home) return router.parseUrl('/login');

	if (!isPageAllowed(role, path)) {
		return router.createUrlTree(['/' + home], { queryParams: { denied: path } });
	}
	if (!planIncludes(plan, path === 'booking' ? 'calendar' : path)) {
		return router.createUrlTree(['/' + home], { queryParams: { locked: path } });
	}

	return true;
};
