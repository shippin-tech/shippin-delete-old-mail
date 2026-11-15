// Every registry object, read through the real facade by the real client, as the administrator.
// A record the generated contract refuses is a disagreement between the server and its own schema:
// the test names the object and the property.
//
// Needs the local stack and deploy/local/.credentials.json. Engine: http://127.0.0.1:28081.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { registry } from '../src/lib/contract/registry.generated';
import { registryClient } from '../src/lib/contract/registry';

const ENGINE = process.env.ENGINE ?? 'http://127.0.0.1:28081';
const creds = JSON.parse(readFileSync(resolve(__dirname, '../../deploy/local/.credentials.json'), 'utf8')) as {
	username: string;
	secret: string;
};
const authorization = `Basic ${Buffer.from(`${creds.username}:${creds.secret}`).toString('base64')}`;

// The client calls a relative path; point it at the engine.
const client = registryClient({
	authorization: () => authorization,
	base: `${ENGINE}/api/v1/registry`
});

type Outcome = { name: string; kind: 'records' | 'empty' | 'refused' | 'contract'; count: number; note?: string };

describe('every registry object against the live server', () => {
	it('the create and update contracts accept what the server itself stores', async () => {
		// A write contract that refuses a value the server already holds would wrongly block a real edit.
		// Only the client-side contracts run here; nothing is written to the server.
		const refusals: string[] = [];
		let checked = 0;
		for (const [name, entry] of Object.entries(registry)) {
			// biome-ignore lint/suspicious/noExplicitAny: iterating names the type system sees one at a time
			const c = client as any;
			const result = entry.singleton ? await c.get(name) : await c.list(name, { limit: 50 });
			if (!result.ok) continue;
			const records = entry.singleton ? [result.value] : result.value.items;
			for (const record of records) {
				for (const mode of ['create', 'update'] as const) {
					// Secrets come back masked ("****"); the schema's rules for them are not about the mask.
					const out = (entry[mode]() as unknown as (v: unknown) => unknown)(record);
					checked++;
					if (out instanceof type.errors) refusals.push(`${name}.${mode} ${out.summary.split(String.fromCharCode(10)).join('; ')}`);
				}
			}
		}
		console.log(`write contracts checked against stored records: ${checked}; refusals ${refusals.length}`);
		expect(refusals, refusals.join(' | ')).toEqual([]);
		expect(checked).toBeGreaterThan(100);
	});

	it('reads and validates each one', async () => {
		const outcomes: Outcome[] = [];
		for (const [name, entry] of Object.entries(registry)) {
			// biome-ignore lint/suspicious/noExplicitAny: iterating names the type system sees one at a time
			const c = client as any;
			const result = entry.singleton ? await c.get(name) : await c.list(name, { limit: 50 });
			if (result.ok) {
				const count = entry.singleton ? 1 : result.value.items.length;
				outcomes.push({ name, kind: count ? 'records' : 'empty', count });
				continue;
			}
			// The server declined: a refusal the server chose (permission, unsupported listing) is not a contract failure.
			if (result.problem.type === 'malformed-response') {
				outcomes.push({ name, kind: 'contract', count: 0, note: JSON.stringify(result.problem.fields) });
			} else {
				outcomes.push({ name, kind: 'refused', count: 0, note: `${result.problem.status} ${result.problem.type}` });
			}
		}
		const by = (k: Outcome['kind']) => outcomes.filter((o) => o.kind === k);
		console.log(
			`registry objects: ${outcomes.length}; with records ${by('records').length}; empty ${by('empty').length}; refused by the server ${by('refused').length}; contract failures ${by('contract').length}`
		);
		console.log('records checked:', outcomes.reduce((n, o) => n + o.count, 0));
		console.log('refused:', by('refused').map((o) => `${o.name} (${o.note})`).join('; '));
		expect(by('contract'), JSON.stringify(by('contract'), null, 1)).toEqual([]);
		// Guard against a vacuous pass: most objects must actually have been read.
		expect(by('records').length).toBeGreaterThan(50);
	});
});
