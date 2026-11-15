// Fails when the server serves an /api route that no OpenAPI file documents.
//
//   node scripts/check-api-coverage.mjs
//
// Routes are read from the match arms of crates/http/src/api/mod.rs (the /api dispatcher).
// Specs: api/compat/v1 (the upstream-compatible management API) and api/shippin/v1 (ours).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'crates/http/src/api/mod.rs'), 'utf8');
const start = source.indexOf('async fn handle_api_request');
const body = source.slice(start);

// Top-level arms look like:   "auth" if is_post => {   or   "" | "product" if ... =>
const segments = new Set();
for (const line of body.split('\n')) {
	const m = /^ {12}((?:"[a-z0-9_.-]*"(?: \| )?)+)(?: if .+?)? =>/.exec(line);
	if (!m) continue;
	for (const s of m[1].matchAll(/"([a-z0-9_.-]*)"/g)) segments.add(s[1]);
}
segments.delete('');

const specs = [
	['compat', 'api/compat/v1/openapi.yml'],
	['shippin', 'api/shippin/v1/openapi.yml']
];
const documented = new Map();
for (const [name, rel] of specs) {
	const path = join(root, rel);
	if (!existsSync(path)) {
		console.error(`missing spec: ${rel}`);
		process.exitCode = 1;
		continue;
	}
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const m = /^ {2}(\/[^:\s]*):/.exec(line);
		if (!m) continue;
		const seg = m[1].split('/')[2] ?? '';
		if (!documented.has(seg)) documented.set(seg, name);
	}
}
// `/api` itself and `/api/product` are the same document.
if (documented.has('')) documented.set('product', documented.get(''));

const missing = [...segments].filter((s) => !documented.has(s)).sort();
console.log(`/api routes served: ${segments.size}; documented: ${segments.size - missing.length}`);
if (missing.length) {
	console.error(`not documented in any spec: ${missing.join(', ')}`);
	process.exitCode = 1;
} else {
	console.log('every /api route is documented');
}
