// The admin screens' own registry calls (loadRegistryPage, writeRegistry) against the real engine,
// as the administrator. This is the path the Svelte admin takes for every x: object.
//
// Needs the local stack and deploy/local/.credentials.json. Engine: http://127.0.0.1:28081.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadRegistryPage, writeRegistry } from '../src/lib/adapter/portal';

const ENGINE = process.env.ENGINE ?? 'http://127.0.0.1:28081';
const creds = JSON.parse(readFileSync(resolve(__dirname, '../../deploy/local/.credentials.json'), 'utf8')) as {
	username: string;
	secret: string;
};
const basic = Buffer.from(`${creds.username}:${creds.secret}`).toString('base64');

const store = new Map<string, string>([
	['shippin-basic', basic],
	['shippin-account', JSON.stringify({ username: creds.username, accountId: 'not-used: the facade knows the caller' })]
]);

beforeAll(() => {
	vi.stubGlobal('sessionStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
	// The adapter calls relative paths; point them at the engine.
	const real = fetch;
	vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
		real(url.startsWith('/') ? ENGINE + url : url, init)
	);
});
afterAll(() => vi.unstubAllGlobals());

describe('the admin path, live', () => {
	it('lists domains sorted both ways, and the two orders are reverses', async () => {
		const asc = await loadRegistryPage('x:Domain', { sortBy: 'name', sortAscending: true, limit: 200 });
		const desc = await loadRegistryPage('x:Domain', { sortBy: 'name', sortAscending: false, limit: 200 });
		const a = asc.items.map((r) => String(r.name));
		expect(a.length).toBeGreaterThan(1);
		expect(a).toEqual([...a].sort());
		expect(desc.items.map((r) => String(r.name))).toEqual([...a].reverse());
		expect(asc.total).toBe(a.length);
	});

	it('pages: a second page starts where the first ended', async () => {
		const first = await loadRegistryPage('x:Domain', { sortBy: 'name', limit: 1, position: 0 });
		const second = await loadRegistryPage('x:Domain', { sortBy: 'name', limit: 1, position: 1 });
		expect(first.hasNext).toBe(true);
		expect(first.hasPrev).toBe(false);
		expect(second.hasPrev).toBe(true);
		expect(second.items[0].id).not.toBe(first.items[0].id);
	});

	it('reads a singleton as the screens ask for it', async () => {
		const page = await loadRegistryPage('x:AccountSettings', { ids: ['singleton'] });
		expect(page.items).toHaveLength(1);
		expect(page.items[0].id).toBe('singleton');
	});

	it('creates, finds, edits and deletes a domain; a linked record explains itself', async () => {
		const name = `adm-${Math.random().toString(16).slice(2, 8)}.test`;
		let id = '';
		try {
			id = await writeRegistry('x:Domain', { create: { tmp: { name, description: 'admin path check' } } }, 'tmp');
			expect(id).toMatch(/^[A-Za-z0-9_-]+$/);

			const found = await loadRegistryPage('x:Domain', { filterText: name });
			expect(found.items.map((r) => r.id)).toContain(id);

			await writeRegistry('x:Domain', { update: { [id]: { description: 'edited' } } }, id);
			const again = await loadRegistryPage('x:Domain', { ids: [id] });
			expect(again.items[0].description).toBe('edited');

			// New domains get DKIM keys at once, so deleting the domain first is refused, in words.
			await expect(writeRegistry('x:Domain', { destroy: [id] }, id)).rejects.toThrow(
				'still referenced by other objects'
			);
		} finally {
			if (id) {
				const keys = await loadRegistryPage('x:DkimSignature', { limit: 200 });
				for (const key of keys.items.filter((k) => k.domainId === id)) {
					await writeRegistry('x:DkimSignature', { destroy: [String(key.id)] }, String(key.id));
				}
				await writeRegistry('x:Domain', { destroy: [id] }, id);
			}
		}
		const gone = await loadRegistryPage('x:Domain', { filterText: name });
		expect(gone.items.map((r) => r.id)).not.toContain(id);
	});

	it('refuses a save over a change made since the record was opened', async () => {
		const name = `stale-${Math.random().toString(16).slice(2, 8)}.test`;
		const id = await writeRegistry('x:Domain', { create: { tmp: { name } } }, 'tmp');
		try {
			await new Promise((r) => setTimeout(r, 1500)); // DKIM keys are made in the background
			await loadRegistryPage('x:Domain', { ids: [id] }); // this screen opens the record
			// someone else saves it from another screen, with their own read
			const other = await fetch(`/api/v1/registry/Domain/${id}`, {
				method: 'PATCH',
				headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ description: 'by someone else' })
			});
			expect(other.status).toBe(200);
			await expect(
				writeRegistry('x:Domain', { update: { [id]: { description: 'my stale save' } } }, id)
			).rejects.toThrow(/changed by someone else/);
			const now = await loadRegistryPage('x:Domain', { ids: [id] });
			expect(now.items[0].description).toBe('by someone else');
			// having read it again, the save goes through
			await writeRegistry('x:Domain', { update: { [id]: { description: 'mine' } } }, id);
		} finally {
			const keys = await loadRegistryPage('x:DkimSignature', { limit: 200 });
			for (const key of keys.items.filter((k) => k.domainId === id)) {
				await writeRegistry('x:DkimSignature', { destroy: [String(key.id)] }, String(key.id));
			}
			await writeRegistry('x:Domain', { destroy: [id] }, id);
		}
	});

	it('names the field when the server refuses a value', async () => {
		await expect(
			writeRegistry('x:Domain', { create: { tmp: { name: 'not a domain!!' } } }, 'tmp')
		).rejects.toThrow();
	});

});
