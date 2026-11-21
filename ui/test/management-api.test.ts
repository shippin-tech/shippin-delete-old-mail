import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	changePassword,
	createAppPassword,
	disableTwoFactor,
	enableTwoFactor,
	loadAppPasswords,
	loadTwoFactor,
	revokeAppPassword
} from '../src/lib/adapter/account';
import { executeAction } from '../src/lib/adapter/actions';
import { completeBootstrap, loadBootstrap } from '../src/lib/adapter/bootstrap';
import { registryClient } from '../src/lib/contract/registry';

type Call = { url: string; method: string; body?: unknown; auth: string | null; tag: string | null };
let calls: Call[];
let answers: { status: number; body?: unknown; etag?: string }[];
let store: Map<string, string>;

beforeEach(() => {
	calls = [];
	answers = [];
	store = new Map([
		['shippin-basic', btoa('test:old')],
		['shippin-account', JSON.stringify({ username: 'test', accountId: 'a' })]
	]);
	vi.stubGlobal('sessionStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key)
	});
	vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined,
			auth: headers.get('Authorization'), tag: headers.get('If-Match') });
		const answer = answers.shift();
		if (!answer) throw new Error('Unscripted request');
		return new Response(answer.status === 204 ? null : JSON.stringify(answer.body ?? null), {
			status: answer.status, headers: answer.etag ? { ETag: answer.etag } : undefined
		});
	}));
});
afterEach(() => vi.unstubAllGlobals());

const passwordRecord = { id: 'singleton', otpAuth: { otpUrl: null } };
const refused = (status: number, kind = 'forbidden') => ({ status, body: { type: kind, title: 'Refused', status } });

describe('actions through the owned API', () => {
	it('accepts a real parameterless action acknowledgement without a discriminator', async () => {
		answers.push({ status: 201, body: { id: '123' } });
		expect(await executeAction('InvalidateNegativeCaches', {})).toEqual({});
		expect(calls[0]).toMatchObject({ url: '/api/v1/registry/Action', method: 'POST', body: { '@type': 'InvalidateNegativeCaches' } });
	});
	it('keeps spam results without requiring an id, and validates nested results', async () => {
		const input = { message: 'From: a@example.test\r\n\r\ntest', remoteIp: '127.0.0.1', ehloDomain: 'example.test', envFrom: 'a@example.test' };
		const result = { result: 'ham', score: 1, tags: { TEST: { disposition: 'score', score: 1 } } };
		answers.push({ status: 201, body: result });
		expect(await executeAction('ClassifySpam', input)).toEqual(result);
		answers.push({ status: 201, body: { ...result, score: 'wrong' } });
		await expect(executeAction('ClassifySpam', input)).rejects.toThrow(/unexpected/i);
	});
	it('keeps DMARC diagnostics and strips undeclared fields', async () => {
		answers.push({ status: 201, body: { dmarcPass: true, elapsed: 12, ipRevPtr: { 'mx.test': true }, unrelated: 'drop' } });
		expect(await executeAction('TroubleshootDmarc', { remoteIp: '127.0.0.1', ehloDomain: 'mx.test', mailFrom: 'a@mx.test' }))
			.toEqual({ dmarcPass: true, elapsed: 12, ipRevPtr: { 'mx.test': true } });
	});
	it('refuses unsupported actions before sending and surfaces server field errors', async () => {
		await expect(executeAction('UnknownAction', {})).rejects.toThrow();
		expect(calls).toHaveLength(0);
		answers.push({ status: 422, body: { type: 'invalidProperties', title: 'Invalid', status: 422, fields: { message: 'Cannot parse' } } });
		await expect(executeAction('ClassifySpam', {})).rejects.toThrow(/message/);
	});
});

describe('account security through the owned API', () => {
	it('reads masked MFA state and sends field patches without replacing otpAuth', async () => {
		answers.push({ status: 200, body: { id: 'singleton', otpAuth: { otpUrl: '****' } } });
		expect(await loadTwoFactor()).toBe(true);
		answers.push({ status: 200, body: passwordRecord }, { status: 200, body: passwordRecord });
		await enableTwoFactor('old', 'otpauth://totp/test?secret=TEST');
		await disableTwoFactor('old', '123456');
		expect(calls.map((c) => c.url)).toEqual(Array(3).fill('/api/v1/registry/AccountPassword'));
		expect(calls[1].body).toEqual({ currentSecret: 'old', 'otpAuth/otpUrl': 'otpauth://totp/test?secret=TEST' });
		expect(calls[2].body).toEqual({ currentSecret: 'old', 'otpAuth/otpCode': '123456', 'otpAuth/otpUrl': null });
	});
	it('changes a password with an OTP and reopens Basic authentication', async () => {
		answers.push({ status: 200, body: passwordRecord }, { status: 200, body: { accounts: { a: {} } } });
		await changePassword('old', 'new', '123456');
		expect(calls[0].body).toEqual({ currentSecret: 'old', secret: 'new', 'otpAuth/otpCode': '123456' });
		expect(calls[1]).toMatchObject({ url: '/jmap/session', auth: `Basic ${btoa('test:new')}` });
		expect(store.get('shippin-basic')).toBe(btoa('test:new'));
	});
	it('does not reopen a bearer session or replace it with Basic', async () => {
		store.set('shippin-bearer', 'test-token');
		answers.push({ status: 200, body: passwordRecord });
		await changePassword('old', 'new', '');
		expect(calls).toHaveLength(1);
		expect(store.get('shippin-bearer')).toBe('test-token');
	});
	it('keeps the old session when a password change is rejected', async () => {
		answers.push(refused(422, 'invalidProperties'));
		await expect(changePassword('wrong', 'new', '')).rejects.toThrow('Refused');
		expect(calls).toHaveLength(1);
		expect(store.get('shippin-basic')).toBe(btoa('test:old'));
	});
	it('rejects a whole otpAuth object rather than silently stripping it', async () => {
		const c = registryClient({ authorization: () => 'test' });
		const result = await c.updatePassword({ currentSecret: 'old', ...{ otpAuth: { otpCode: '123456' } } });
		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('returns the creation secret once, lists every page without secrets, and revokes', async () => {
		answers.push({ status: 201, body: { id: 'p1', secret: 'synthetic-secret' } });
		expect(await createAppPassword('Phone')).toBe('synthetic-secret');
		answers.push(
			{ status: 200, body: { items: [{ id: 'p1', description: 'Phone', secret: '****' }], position: 0, total: 2 } },
			{ status: 200, body: { items: [{ id: 'p2' }], position: 1, total: 2 } }
		);
		expect(await loadAppPasswords()).toEqual([
			{ id: 'p1', description: 'Phone', createdAt: null, expiresAt: null },
			{ id: 'p2', description: '', createdAt: null, expiresAt: null }
		]);
		expect(calls[2].url).toContain('position=1');
		answers.push({ status: 204 });
		await revokeAppPassword('p1');
		expect(calls[3]).toMatchObject({ url: '/api/v1/registry/AppPassword/p1', method: 'DELETE' });
	});
	it('rejects a missing creation secret and a refused revocation', async () => {
		answers.push({ status: 201, body: { id: 'p1' } }, refused(403));
		await expect(createAppPassword('Phone')).rejects.toThrow(/did not return/);
		await expect(revokeAppPassword('p1')).rejects.toThrow('Refused');
	});
	it('ends an expired session and does not send when signed out', async () => {
		answers.push(refused(401));
		await expect(loadTwoFactor()).rejects.toThrow('sign-in required');
		await expect(createAppPassword('Phone')).rejects.toThrow('sign-in required');
		expect(calls).toHaveLength(1);
	});
	it('does not send another account’s cached ETag', async () => {
		let auth = 'account-a';
		const c = registryClient({ authorization: () => auth });
		answers.push({ status: 200, body: passwordRecord, etag: '"account-a"' });
		await c.get('AccountPassword');
		auth = 'account-b';
		answers.push({ status: 200, body: passwordRecord });
		await c.updatePassword({ currentSecret: 'old', secret: 'new' });
		expect(calls[1].tag).toBeNull();
	});
});

describe('bootstrap through the owned API', () => {
	it('treats only an absent bootstrap record as a configured host', async () => {
		answers.push(refused(404, 'notFound'), refused(404, 'unknown-object'), refused(403));
		expect(await loadBootstrap()).toEqual([]);
		await expect(loadBootstrap()).rejects.toThrow('Refused');
		await expect(loadBootstrap()).rejects.toThrow('Refused');
	});
	it('preserves choices and boolean patches and shows credentials from the save response', async () => {
		answers.push({ status: 200, body: { id: 'singleton', username: 'admin', secret: 'synthetic-secret' } });
		const result = await completeBootstrap([{ fields: [
			{ name: 'serverHostname', kind: 'string' }, { name: 'generateDkimKeys', kind: 'boolean' }
		] }], { serverHostname: 'mx.example.test', generateDkimKeys: true });
		expect(calls[0]).toMatchObject({ url: '/api/v1/registry/Bootstrap', method: 'PATCH', body: { serverHostname: 'mx.example.test', generateDkimKeys: true } });
		expect(result).toEqual({ status: 'saved', credentials: [
			{ label: 'username', value: 'admin' }, { label: 'secret', value: 'synthetic-secret' }
		] });
		expect(calls).toHaveLength(1);
	});
});
