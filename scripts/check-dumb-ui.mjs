#!/usr/bin/env node
// The UI is dumb: it shows what the server says and sends what the person did. This checks the
// edge of that rule, which is where the network is touched.
//
//   1. No .svelte file touches the network (fetch, XMLHttpRequest, EventSource, WebSocket, sendBeacon).
//   2. Outside ui/src/lib/adapter and ui/src/lib/contract, only the modules named in ALLOWED touch it.
//   3. ALLOWED can only shrink. An entry whose file no longer touches the network must be deleted,
//      so a migrated module cannot go back.
//
// The target is an empty ALLOWED: every call goes through the typed client in src/lib/contract
// (ArkType checked on the way out and on the way in) or a module in src/lib/adapter.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'src');
const NETWORK = /\b(fetch\s*\(|new\s+XMLHttpRequest|new\s+EventSource|new\s+WebSocket|sendBeacon\s*\()/;
const EDGE = ['lib/adapter/', 'lib/contract/'];

// Modules that still call the network themselves. Migrate each to the typed client, then delete its line.
const ALLOWED = new Set([
	'lib/shippin/agent/agent.svelte.ts',
	'lib/shippin/alerts/alerts.ts',
	'lib/shippin/assistant/assistant.ts',
	'lib/shippin/calendar-templates/calendar-templates.ts',
	'lib/shippin/dashboard/stats.ts',
	'lib/shippin/keys/keys-admin.ts',
	'lib/shippin/org/brand.ts',
	'lib/shippin/org/orgs.ts',
	'lib/shippin/org/provisioning.ts',
	'lib/shippin/org/sso.ts',
	'lib/shippin/recover/recover.ts',
	'lib/shippin/resources/resources.ts'
]);

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (/\.(svelte|ts|js)$/.test(entry.name)) yield path;
	}
}

/** Strips comments and string-free noise enough that a mention in prose does not count. */
function code(text) {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const problems = [];
const touching = new Set();
for (const file of walk(root)) {
	const rel = relative(root, file).split(sep).join('/');
	const isStory = /\.stories\.(svelte|ts)$/.test(rel);
	if (isStory) continue;
	if (!NETWORK.test(code(readFileSync(file, 'utf8')))) continue;
	touching.add(rel);
	if (rel.endsWith('.svelte')) {
		problems.push(`${rel}: a component touches the network; move the call into an adapter`);
	} else if (!EDGE.some((prefix) => rel.startsWith(prefix)) && !ALLOWED.has(rel)) {
		problems.push(`${rel}: touches the network outside the adapter and contract layers`);
	}
}
for (const rel of ALLOWED) {
	if (!touching.has(rel)) problems.push(`${rel}: no longer touches the network; delete it from ALLOWED`);
}

if (problems.length) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(`dumb UI: ok (${ALLOWED.size} modules still to move onto the typed client)`);
