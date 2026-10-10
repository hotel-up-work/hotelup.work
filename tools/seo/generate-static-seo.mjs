import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const outputDirs = [path.join(rootDir, 'dist/app/browser')];

// Public, indexable pages. The signed-in app (dashboard, calendar, booking, ...) is client-rendered and noindex.
const staticRoutes = ['/', '/pricing', '/privacy', '/cookies'];

const company = await readJson('src/data/company/company.json');
const siteUrl = trimTrailingSlash(company.siteUrl || 'https://example.com');
const pageSeo = company.pageSeo ?? {};

const routes = staticRoutes.filter((route) => isIndexable(route, pageSeo));
const lastmod = new Date().toISOString().slice(0, 10);

await Promise.all(
	outputDirs.map(async (outputDir) => {
		await mkdir(outputDir, { recursive: true });
		await writeFile(path.join(outputDir, 'sitemap.xml'), buildSitemap(routes, siteUrl, lastmod));
		await writeFile(path.join(outputDir, 'robots.txt'), buildRobots(siteUrl));
		await writeSpaFallback(outputDir);
	}),
);

/**
 * GitHub Pages answers any path without its own file (every signed-in app route, e.g. /booking) with 404.html.
 * That file is the empty client shell, so the app starts and routes itself; the prerendered home page would
 * flash landing content and fail hydration on a different route.
 */
async function writeSpaFallback(outputDir) {
	const shell = path.join(outputDir, 'index.csr.html');
	const fallback = path.join(outputDir, 'index.html');
	await copyFile(await exists(shell) ? shell : fallback, path.join(outputDir, '404.html'));
}

async function exists(file) {
	try {
		await readFile(file);
		return true;
	} catch {
		return false;
	}
}

function buildSitemap(routes, siteUrl, lastmod) {
	const urls = routes
		.map(
			(route) => `	<url>
		<loc>${escapeXml(toAbsoluteUrl(siteUrl, route))}</loc>
		<lastmod>${lastmod}</lastmod>
	</url>`,
		)
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function buildRobots(siteUrl) {
	return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function isIndexable(route, pageSeo) {
	const robots = pageSeo[route]?.robots;

	return typeof robots !== 'string' || !robots.toLowerCase().includes('noindex');
}

async function readJson(relativePath) {
	return JSON.parse(await readFile(path.join(rootDir, relativePath), 'utf8'));
}

function toAbsoluteUrl(siteUrl, route) {
	return `${siteUrl}${route}`;
}

function trimTrailingSlash(value) {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function escapeXml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
