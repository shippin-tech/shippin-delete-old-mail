// Compares the new UI adapters with the existing engine operations using a disposable account.
// Credentials stay in memory; assertions deliberately do not include request/response bodies.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { changePassword, createAppPassword, loadAppPasswords, loadTwoFactor, revokeAppPassword } from '../src/lib/adapter/account';
import { executeAction } from '../src/lib/adapter/actions';
import { loadBootstrap } from '../src/lib/adapter/bootstrap';
import { openSession } from '../src/lib/adapter/session';

const engine = process.env.ENGINE ?? 'http://127.0.0.1:28081';
const admin = JSON.parse(readFileSync(resolve(__dirname, '../../deploy/local/.credentials.json'), 'utf8')) as { username: string; secret: string };
const basic = (user: string, secret: string) => `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;
const adminAuth = basic(admin.username, admin.secret);
const network = fetch;
const store = new Map<string, string>();
const requests: string[] = [];

async function request(path: string, auth: string, method = 'GET', body?: unknown) {
	return network(engine + path, {
		method, headers: { Authorization: auth, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000)
	});
}

async function baseline(auth: string, method: string, args: Record<string, unknown>) {
	const response = await request('/jmap', auth, 'POST', {
		using: ['urn:ietf:params:jmap:core', 'urn:shippin.tech:jmap'], methodCalls: [[method, args, 'test']]
	});
	assert(response.status === 200, 'Baseline request failed');
	const body = await response.json();
	assert(body.methodResponses?.[0]?.[0] === method, 'Baseline method was refused');
	return body.methodResponses[0][1];
}

beforeAll(() => {
	vi.stubGlobal('sessionStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key)
	});
	vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
		requests.push(url);
		return network(url.startsWith('/') ? engine + url : url, { ...init, signal: AbortSignal.timeout(30_000) });
	});
});
afterAll(() => vi.unstubAllGlobals());

it('preserves action outputs through the owned API and detects a configured host', async () => {
	await openSession(admin.username, admin.secret);
	const old = await baseline(adminAuth, 'x:Action/set', { create: { test: { '@type': 'InvalidateNegativeCaches' } } });
	assert(Boolean(old.created?.test), 'Baseline action was not confirmed');
	expect(await executeAction('InvalidateNegativeCaches', {})).toEqual({});
	const params = {
		remoteIp: '127.0.0.1', ehloDomain: 'mail.local.test', envFrom: 'test@local.test',
		envRcptTo: { 'test@local.test': true }, isTls: true,
		message: 'From: test@local.test\r\nTo: test@local.test\r\nSubject: Synthetic parity check\r\n\r\nTest message.\r\n'
	};
	const classified = await baseline(adminAuth, 'x:Action/set', { create: { test: { '@type': 'ClassifySpam', ...params } } });
	assert(Boolean(classified.created?.test), 'Baseline classification was not confirmed');
	const current = await executeAction('ClassifySpam', params);
	expect(current.result).toBe(classified.created.test.result);
	expect(typeof current.score).toBe('number');
	expect(current.tags).toEqual(classified.created.test.tags);
	expect(await loadBootstrap()).toEqual([]);
	expect(requests.filter((path) => path === '/jmap')).toEqual([]);
});

it('preserves password changes, app-password authentication and revocation on a disposable account', async () => {
	const name = `cutover-${randomBytes(5).toString('hex')}`;
	const first = randomBytes(24).toString('base64url');
	const second = randomBytes(24).toString('base64url');
	const third = randomBytes(24).toString('base64url');
	const domains = await request('/api/v1/registry/Domain?limit=500', adminAuth);
	assert(domains.status === 200, 'Could not read local test domains');
	const domain = (await domains.json()).items.find((row: { name: string }) => row.name === 'local.test');
	assert(Boolean(domain), 'The documented local.test fixture is missing');
	const username = `${name}@local.test`;
	const created = await request('/api/v1/registry/Account', adminAuth, 'POST', {
		'@type': 'User', name, domainId: domain.id, roles: { '@type': 'User' },
		credentials: { '0': { '@type': 'Password', secret: first } }
	});
	assert(created.status === 201, 'Could not create disposable account');
	const id = (await created.json()).id;
	assert(typeof id === 'string', 'No disposable account id returned');
	try {
		const old = await baseline(basic(username, first), 'x:AccountPassword/set', {
			update: { singleton: { currentSecret: first, secret: second } }
		});
		assert(Object.hasOwn(old.updated ?? {}, 'singleton'), 'Baseline password change failed');
		assert((await request('/jmap/session', basic(username, first))).status === 401, 'Baseline left the old password valid');
		await openSession(username, second);
		expect(await loadTwoFactor()).toBe(false);
		await expect(changePassword('incorrect synthetic password', third, '')).rejects.toThrow();
		await changePassword(second, third, '');
		assert((await request('/jmap/session', basic(username, second))).status === 401, 'Candidate left the old password valid');
		assert((await request('/jmap/session', basic(username, third))).status === 200, 'Candidate password does not authenticate');
		const secret = await createAppPassword('Cutover test');
		assert(secret.length >= 16, 'Creation did not return a generated secret');
		const listed = await loadAppPasswords();
		assert(listed.length === 1 && listed[0].description === 'Cutover test', 'App password listing changed');
		assert(!Object.hasOwn(listed[0], 'secret'), 'Adapter leaked a secret into the listing');
		const baselineRead = await baseline(basic(username, third), 'x:AppPassword/get', { ids: [listed[0].id] });
		assert(baselineRead.list?.[0]?.secret !== secret, 'Stored record exposed the creation secret');
		assert((await request('/jmap/session', basic(username, secret))).status === 200, 'Generated app password cannot authenticate');
		await revokeAppPassword(listed[0].id);
		expect(await loadAppPasswords()).toEqual([]);
		assert((await request('/jmap/session', basic(username, secret))).status === 401, 'Revoked app password still authenticates');
		expect(requests.filter((path) => path === '/jmap')).toEqual([]);
	} finally {
		const removed = await request(`/api/v1/registry/Account/${id}`, adminAuth, 'DELETE');
		assert(removed.status === 204, 'Disposable account cleanup failed');
	}
});
