import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'dist/app/browser');
const cards = JSON.parse(await readFile(path.join(root, 'tools/seo/social-images.json'), 'utf8'));
const company = JSON.parse(await readFile(path.join(root, 'src/data/company/company.json'), 'utf8'));
const expected = new Map(cards.map(({ route, slug }) => [route, `${company.siteUrl}/seo/${slug}.jpg`]));
assert.equal(expected.size, cards.length, 'Duplicate route in social-images.json');
assert.equal(new Set(cards.map(({ slug }) => slug)).size, cards.length, 'Duplicate social image slug');
const declaredRoutes = await verifyRouteCoverage();

const seed = await readFile(path.join(root, 'src/index.html'), 'utf8');
verifyMeta(seed, expected.get(''), 'seed HTML');
assert.equal(company.defaultSeo?.image, expected.get(''), 'Default social image must use the home card');

for (const { route, slug } of cards) {
	const html = await readFile(path.join(output, route, 'index.html'), 'utf8');
	verifyMeta(html, expected.get(route), route || '/');
	const source = await readFile(path.join(root, 'src/assets/seo', `${slug}.jpg`));
	const built = await readFile(path.join(output, 'seo', `${slug}.jpg`));
	assert.ok(source.equals(built), `${slug}: built asset differs from source`);
	assert.deepEqual(jpegSize(source), [1200, 630], `${slug}: incorrect dimensions`);
}

const proposals = await readdir(path.join(output, 'proposal'), { withFileTypes: true });
let proposalCount = 0;
for (const entry of proposals) {
	if (!entry.isDirectory()) continue;
	const html = await readFile(path.join(output, 'proposal', entry.name, 'index.html'), 'utf8');
	verifyMeta(html, expected.get('proposal'), `proposal/${entry.name}`);
	proposalCount++;
}
console.log(`Verified ${declaredRoutes.size} configured page paths, ${cards.length} page cards and ${proposalCount} hotel proposal pages: route coverage, seed/default metadata, Open Graph, Twitter, copied JPEGs and 1200 × 630 dimensions.`);

async function verifyRouteCoverage() {
	const source = ts.createSourceFile('app.routes.ts', await readFile(path.join(root, 'src/app/app.routes.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
	const constants = new Map();
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name)) constants.set(declaration.name.text, declaration.initializer);
		}
	}
	const resolve = (node) => node && ts.isIdentifier(node) ? constants.get(node.text) : node;
	const property = (node, key) => {
		node = resolve(node);
		return node && ts.isObjectLiteralExpression(node)
			? node.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(source).replace(/['"]/g, '') === key)?.initializer
			: undefined;
	};
	const checked = new Map();
	function walk(array, parent = '', parentImage) {
		assert.ok(array && ts.isArrayLiteralExpression(array), 'Expected literal route array');
		for (const route of array.elements) {
			const segment = property(route, 'path');
			assert.ok(segment && ts.isStringLiteral(segment), 'Expected literal route path');
			if (segment.text === '**' || property(route, 'redirectTo')) continue;
			const fullPath = [parent, segment.text].filter(Boolean).join('/');
			const meta = property(property(route, 'data'), 'meta');
			const imageCall = resolve(property(meta, 'image'));
			let image = parentImage;
			if (imageCall) {
				assert.ok(ts.isCallExpression(imageCall), `${fullPath}: expected buildAbsoluteUrl for image`);
				const imagePath = imageCall.arguments[1];
				assert.ok(imagePath && ts.isStringLiteral(imagePath), `${fullPath}: expected literal image path`);
				image = new URL(imagePath.text, company.siteUrl).href;
			}
			if (property(route, 'loadComponent')) {
				// Parameterized proposals and settings sections intentionally share their parent's card.
				const cardRoute = fullPath.startsWith('proposal/') ? 'proposal' : fullPath.startsWith('settings/') ? 'settings' : fullPath;
				assert.ok(expected.has(cardRoute), `${fullPath}: missing card in social-images.json`);
				assert.equal(image, expected.get(cardRoute), `${fullPath}: incorrect or missing route image`);
				checked.set(fullPath, image);
			}
			const children = property(route, 'children');
			if (children) walk(resolve(children), fullPath, image);
		}
	}
	walk(constants.get('routes'));
	for (const { route } of cards) assert.ok(checked.has(route), `${route}: social card has no configured route`);
	return checked;
}

function verifyMeta(html, image, route) {
	for (const key of ['image', 'og:image', 'twitter:image', 'twitter:image:src']) {
		const tags = html.match(/<meta\b[^>]*>/g) ?? [];
		const matches = tags.filter((tag) => tag.includes(`="${key}"`));
		assert.equal(matches.length, 1, `${route}: expected one ${key} tag`);
		assert.ok(matches[0].includes(`content="${image}"`), `${route}: wrong ${key}`);
	}
	for (const [key, value] of [['og:image:width', '1200'], ['og:image:height', '630'], ['og:image:type', 'image/jpeg']]) {
		const matches = (html.match(/<meta\b[^>]*>/g) ?? []).filter((tag) => tag.includes(`="${key}"`));
		assert.equal(matches.length, 1, `${route}: expected one ${key} tag`);
		assert.ok(matches[0].includes(`content="${value}"`), `${route}: wrong ${key}`);
	}
}

function jpegSize(bytes) {
	assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Not a JPEG');
	let offset = 2;
	while (offset < bytes.length) {
		assert.equal(bytes[offset], 0xff, 'Invalid JPEG marker');
		const marker = bytes[offset + 1];
		const length = bytes.readUInt16BE(offset + 2);
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
		}
		offset += length + 2;
	}
	throw new Error('JPEG has no frame dimensions');
}
