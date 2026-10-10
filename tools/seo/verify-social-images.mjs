import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'dist/app/browser');
const cards = JSON.parse(await readFile(path.join(root, 'tools/seo/social-images.json'), 'utf8'));
const company = JSON.parse(await readFile(path.join(root, 'src/data/company/company.json'), 'utf8'));
const expected = new Map(cards.map(({ route, slug }) => [route, `${company.siteUrl}/seo/${slug}.jpg`]));

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
console.log(`Verified ${cards.length} page cards and ${proposalCount} hotel proposal pages: Open Graph, Twitter, copied JPEGs and 1200 × 630 dimensions.`);

function verifyMeta(html, image, route) {
	for (const key of ['og:image', 'twitter:image', 'twitter:image:src']) {
		const tags = html.match(/<meta\b[^>]*>/g) ?? [];
		const matches = tags.filter((tag) => tag.includes(`="${key}"`));
		assert.equal(matches.length, 1, `${route}: expected one ${key} tag`);
		assert.ok(matches[0].includes(`content="${image}"`), `${route}: wrong ${key}`);
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
