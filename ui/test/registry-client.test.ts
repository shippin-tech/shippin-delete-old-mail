import { describe, expect, it, vi } from 'vitest';
import { registryClient } from '../src/lib/contract/registry';

type Call = { url: string; init: RequestInit };

/** A fetch that answers from a script and records what it was asked. */
function server(...answers: { status: number; body?: unknown; raw?: string }[]) {
	const calls: Call[] = [];
	const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		const answer = answers.shift();
		if (!answer) throw new Error('no answer scripted');
		const text = answer.raw ?? (answer.body === undefined ? '' : JSON.stringify(answer.body));
		return new Response(answer.status === 204 ? null : text, { status: answer.status });
	});
	return { fetcher: fetcher as unknown as typeof fetch, calls };
}

// `null` is signed out: `undefined` would apply the default and hide the case.
const client = (fetcher: typeof fetch, authorization: string | null = 'Basic abc') =>
	registryClient({ authorization: () => authorization ?? undefined, fetch: fetcher });

const domain = {
	id: 'b',
	name: 'x.test',
	description: null,
	allowRelaying: false,
	aliases: { 'y.test': true }
};

describe('reading', () => {
	it('lists a page with the right request', async () => {
		const s = server({ status: 200, body: { items: [domain], position: 0, total: 1 } });
		const r = await client(s.fetcher).list('Domain', { limit: 10, position: 0, filter: { text: 'x' } });
		expect(s.calls[0].url).toBe(
			`/api/v1/registry/Domain?limit=10&position=0&filter=${encodeURIComponent('{"text":"x"}')}`
		);
		expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBe('Basic abc');
		expect(s.calls[0].init.method).toBe('GET');
		expect(r.ok && r.value.items[0].name).toBe('x.test');
		expect(r.ok && r.value.total).toBe(1);
	});

	it('sends no Authorization header when signed out', async () => {
		const s = server({ status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } });
		const r = await client(s.fetcher, null).list('Domain');
		expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
		expect(!r.ok && r.problem.status).toBe(401);
	});

	it('drops undeclared keys at every depth, and a __proto__ key in a set', async () => {
		const wire = `{"items":[{"id":"b","name":"x.test","extra":1,"aliases":{"ok.test":true,"__proto__":true,"constructor":true}}],"position":0,"junk":1}`;
		const s = server({ status: 200, raw: wire });
		const r = await client(s.fetcher).list('Domain');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(Object.keys(r.value)).toEqual(['items', 'position']);
		const item = r.value.items[0] as Record<string, unknown>;
		expect(item.extra).toBeUndefined();
		expect(Object.keys(item.aliases as object)).toEqual(['ok.test']);
		expect(Object.hasOwn(item.aliases as object, '__proto__')).toBe(false);
	});

	it('reads a singleton without an id', async () => {
		const s = server({ status: 200, body: { id: 'singleton', locale: 'en-US', timeZone: null } });
		const r = await client(s.fetcher).get('AccountSettings');
		expect(s.calls[0].url).toBe('/api/v1/registry/AccountSettings');
		expect(r.ok && r.value.locale).toBe('en-US');
	});

	it('refuses a record whose values have the wrong type, naming the property', async () => {
		const s = server({ status: 200, body: { items: [{ id: 'b', allowRelaying: 'yes' }], position: 0 } });
		const r = await client(s.fetcher).list('Domain');
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.problem.type).toBe('malformed-response');
		expect(Object.keys(r.problem.fields ?? {})).toEqual(['items[0].allowRelaying']);
	});

	it('refuses an enum value the schema does not list', async () => {
		const s = server({ status: 200, body: { id: 'singleton', locale: 'xx-XX' } });
		const r = await client(s.fetcher).get('AccountSettings');
		expect(r.ok).toBe(false);
	});

	it('accepts null for a nullable value and refuses it for a required-type value', async () => {
		const ok = await client(server({ status: 200, body: { id: 'b', description: null } }).fetcher).get(
			'Domain',
			'b'
		);
		expect(ok.ok).toBe(true);
		const bad = await client(server({ status: 200, body: { id: 'b', allowRelaying: null } }).fetcher).get(
			'Domain',
			'b'
		);
		expect(bad.ok).toBe(false);
	});

	it('encodes names and ids into the path', async () => {
		const s = server({ status: 404, body: { type: 'notFound', title: 'No such record', status: 404 } });
		await client(s.fetcher).get('Domain', 'a/b c');
		expect(s.calls[0].url).toBe('/api/v1/registry/Domain/a%2Fb%20c');
	});
});

describe('writing', () => {
	it('sends only what the create contract names, and returns the stored record', async () => {
		const s = server({ status: 201, body: { id: 'c', name: 'new.test' } });
		const r = await client(s.fetcher).create('Domain', {
			name: 'new.test',
			allowRelaying: true,
			// biome-ignore lint/suspicious/noExplicitAny: proving that keys outside the contract are not sent
			...({ createdAt: 'server-set', evil: 1 } as any)
		});
		expect(s.calls[0].init.method).toBe('POST');
		expect(JSON.parse(String(s.calls[0].init.body))).toEqual({ name: 'new.test', allowRelaying: true });
		expect(r.ok && r.value.id).toBe('c');
	});

	it('does not send a value the contract refuses, and says which field', async () => {
		const s = server();
		// biome-ignore lint/suspicious/noExplicitAny: a form could send anything
		const r = await client(s.fetcher).create('Domain', { name: 42 } as any);
		expect(s.fetcher).not.toHaveBeenCalled();
		expect(!r.ok && r.problem.type).toBe('invalid-input');
		expect(!r.ok && r.problem.status).toBe(422);
		expect(!r.ok && Object.keys(r.problem.fields ?? {})).toEqual(['name']);
	});

	it('update leaves out server-set properties and sends a PATCH for the id', async () => {
		const s = server({ status: 200, body: { id: 'b', description: 'hello' } });
		// biome-ignore lint/suspicious/noExplicitAny: createdAt is server-set, so it must be dropped
		const r = await client(s.fetcher).update('Domain', 'b', { description: 'hello', createdAt: 'x' } as any);
		expect(s.calls[0].url).toBe('/api/v1/registry/Domain/b');
		expect(s.calls[0].init.method).toBe('PATCH');
		expect(JSON.parse(String(s.calls[0].init.body))).toEqual({ description: 'hello' });
		expect(r.ok && r.value.description).toBe('hello');
	});

	it('updates a singleton without an id', async () => {
		const s = server({ status: 200, body: { id: 'singleton', locale: 'en-US' } });
		await client(s.fetcher).update('AccountSettings', undefined, { locale: 'en-US' });
		expect(s.calls[0].url).toBe('/api/v1/registry/AccountSettings');
	});

	it('removes with DELETE and accepts 204 with no body', async () => {
		const s = server({ status: 204 });
		const r = await client(s.fetcher).remove('Domain', 'b');
		expect(s.calls[0].init.method).toBe('DELETE');
		expect(r.ok).toBe(true);
	});
});

describe('failures', () => {
	it('returns the server problem with its field messages', async () => {
		const problem = { type: 'invalidProperties', title: 'x', status: 422, fields: { name: 'Taken' } };
		const r = await client(server({ status: 422, body: problem }).fetcher).create('Domain', {
			name: 'a.test'
		});
		expect(!r.ok && r.problem).toEqual(problem);
	});

	it('reports a refusal that is not a problem document with the real status', async () => {
		const r = await client(server({ status: 502, raw: '<html>bad gateway</html>' }).fetcher).get(
			'Domain',
			'b'
		);
		expect(!r.ok && r.problem.type).toBe('http-error');
		expect(!r.ok && r.problem.status).toBe(502);
	});

	it('does not read a success status with an unparseable body as success', async () => {
		const r = await client(server({ status: 200, raw: 'not json' }).fetcher).get('Domain', 'b');
		expect(!r.ok && r.problem.type).toBe('malformed-response');
	});

	it('does not read an error status with a success-shaped body as success', async () => {
		const r = await client(server({ status: 500, body: domain }).fetcher).get('Domain', 'b');
		expect(r.ok).toBe(false);
	});

	it('turns a network failure into a problem instead of throwing', async () => {
		const fetcher = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const r = await client(fetcher).get('Domain', 'b');
		expect(!r.ok && r.problem.type).toBe('network-error');
		expect(!r.ok && r.problem.status).toBe(503);
	});
});

describe('variants', () => {
	it('reads an account by its @type and refuses one with an unknown @type', async () => {
		const ok = await client(
			server({ status: 200, body: { id: 'a', '@type': 'User', name: 'jane' } }).fetcher
		).get('Account', 'a');
		expect(ok.ok).toBe(true);
		const bad = await client(
			server({ status: 200, body: { id: 'a', '@type': 'Robot', name: 'r' } }).fetcher
		).get('Account', 'a');
		expect(bad.ok).toBe(false);
	});
});
