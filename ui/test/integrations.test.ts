import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMicrosoftProvider } from '../src/lib/integrations/microsoft';
import { graphUrl, MicrosoftGraph, microsoftFile } from '../src/lib/integrations/microsoft-graph';
import { boundedBlob, fileKey, httpsLink, MAX_TRANSFER_BYTES, type ConnectedFile } from '../src/lib/integrations/types';

const file: ConnectedFile = { id: 'file-1', driveId: 'drive-1', name: 'Budget.xlsx', kind: 'file', type: 'application/octet-stream', size: 4, modified: '', webUrl: '', exports: [] };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Microsoft Graph boundary', () => {
	it('limits bearer-authenticated calls to the Graph v1 origin', async () => {
		const request = vi.fn<typeof fetch>();
		const token = vi.fn(async () => 'private-token');
		const graph = new MicrosoftGraph(token, request);
		for (const cursor of ['https://evil.test/v1.0/me', '//evil.test/v1.0/me', 'https://graph.microsoft.com@evil.test/v1.0/me', 'https://graph.microsoft.com/beta/me']) {
			await expect(graph.list({ cursor })).rejects.toThrow('invalid continuation');
		}
		expect(token).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
		expect(graphUrl('me/drive/root/children')).toBe('https://graph.microsoft.com/v1.0/me/drive/root/children');
	});

	it('uses search and continuation URLs without mixing drive identifiers', async () => {
		const cursor = 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next';
		const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ value: [{ id: '1', name: 'Budget.xlsx', file: { mimeType: 'sheet' }, parentReference: { driveId: 'D' } }], '@odata.nextLink': cursor })).mockResolvedValueOnce(Response.json({ value: [] }));
		const graph = new MicrosoftGraph(async () => 'token', request);
		const result = await graph.list({ search: "Jesse's budget" });
		expect(decodeURIComponent(String(request.mock.calls[0][0]))).toContain("search(q='Jesse''s budget')");
		expect(result.files[0]).toMatchObject({ id: '1', driveId: 'D', name: 'Budget.xlsx' });
		await graph.list({ cursor: result.cursor! });
		expect(String(request.mock.calls[1][0])).toBe(cursor);
	});

	it('does not forward a bearer token to a download URL and preserves bytes', async () => {
		const bytes = new Uint8Array([0, 255, 5, 19]);
		const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: file.id, '@microsoft.graph.downloadUrl': 'https://download.example.test/content' })).mockResolvedValueOnce(new Response(bytes));
		const graph = new MicrosoftGraph(async () => 'graph-secret', request);
		const content = await graph.read(file);
		expect(new Uint8Array(await content.arrayBuffer())).toEqual(bytes);
		expect(content.name).toBe(file.name);
		expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer graph-secret' });
		expect(request.mock.calls[1][1]?.headers).toBeUndefined();
		expect(request.mock.calls[1][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
	});

	it('rejects unsafe downloads, bad responses, folders and oversized transfers', async () => {
		const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ '@microsoft.graph.downloadUrl': 'javascript:alert(1)' })).mockResolvedValueOnce(Response.json({ unexpected: [] }));
		const graph = new MicrosoftGraph(async () => 'token', request);
		await expect(graph.read(file)).rejects.toThrow('did not provide a download');
		await expect(graph.list({})).rejects.toThrow('unreadable file list');
		await expect(graph.read({ ...file, kind: 'folder' })).rejects.toThrow('Open the folder');
		await expect(graph.read({ ...file, size: MAX_TRANSFER_BYTES + 1 })).rejects.toThrow('100 MB');
		expect(request).toHaveBeenCalledTimes(2);
	});

	it.each([[401, 'Reconnect'], [403, 'organisation'], [404, 'unavailable'], [429, 'Wait a moment']])('gives actionable HTTP %s feedback', async (status, message) => {
		const graph = new MicrosoftGraph(async () => 'token', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: Number(status) })));
		await expect(graph.list({})).rejects.toThrow(String(message));
	});

	it('normalizes shared references, rejects unsafe open links and distinguishes same IDs on different drives', () => {
		expect(microsoftFile({ id: 'shortcut', name: 'Shortcut', remoteItem: { id: 'actual', name: 'Team', folder: {}, parentReference: { driveId: 'other' }, webUrl: 'javascript:bad' } })).toMatchObject({ id: 'actual', driveId: 'other', kind: 'folder', webUrl: '' });
		expect(microsoftFile({ id: 'notebook', name: 'Notebook', package: {} })).toBeNull();
		expect(fileKey({ id: '1', driveId: 'A' })).not.toBe(fileKey({ id: '1', driveId: 'B' }));
		expect(httpsLink('https://user:password@example.test')).toBe('');
	});

	it('bounds downloads even if their length is unknown', async () => {
		const cancel = vi.fn();
		const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_TRANSFER_BYTES + 1)); }, cancel });
		await expect(boundedBlob(new Response(stream), 'text/plain')).rejects.toThrow('100 MB');
		expect(cancel).toHaveBeenCalledOnce();
		await expect(boundedBlob(new Response('x', { headers: { 'Content-Length': String(MAX_TRANSFER_BYTES + 1) } }), 'text/plain')).rejects.toThrow('100 MB');
	});
});

function authHarness() {
	let owner = 'shippin-account-a';
	let active: AccountInfo | null = null;
	const microsoftAccount = { homeAccountId: 'ms-1', username: 'person@example.test' } as AccountInfo;
	const instance = {
		getActiveAccount: vi.fn(() => active),
		setActiveAccount: vi.fn((value: AccountInfo | null) => { active = value; }),
		clearCache: vi.fn(async () => { active = null; }),
		loginPopup: vi.fn(async () => ({ account: microsoftAccount })),
		acquireTokenSilent: vi.fn(async () => ({ accessToken: 'memory-token' }))
	};
	const load = vi.fn(async () => instance as unknown as IPublicClientApplication);
	return { instance, load, microsoftAccount, host: { owner: () => owner, load }, changeOwner: () => { owner = 'shippin-account-b'; } };
}

describe('Microsoft connection ownership', () => {
	it('does not load the SDK when Microsoft is not configured', async () => {
		const h = authHarness();
		const provider = createMicrosoftProvider(null, h.host);
		expect(await provider.status()).toEqual({ available: false, connected: false, email: null });
		expect(h.load).not.toHaveBeenCalled();
	});

	it('requests only files access and disconnects without globally signing out of Microsoft', async () => {
		const h = authHarness();
		const provider = createMicrosoftProvider({ clientId: 'client', tenant: 'common' }, h.host);
		await provider.connect();
		expect(h.instance.loginPopup).toHaveBeenCalledWith({ scopes: ['Files.Read'], prompt: 'select_account' });
		expect(await provider.status()).toMatchObject({ connected: true, email: 'person@example.test' });
		await provider.disconnect();
		expect(h.instance.clearCache).toHaveBeenCalledOnce();
		expect(await provider.status()).toMatchObject({ connected: false, email: null });
	});

	it('refuses a token or pending popup after the shippinTECH account changes', async () => {
		const h = authHarness();
		const request = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', request);
		const provider = createMicrosoftProvider({ clientId: 'client', tenant: 'common' }, h.host);
		await provider.connect();
		h.changeOwner();
		expect(await provider.status()).toMatchObject({ connected: false, email: null });
		await expect(provider.list({})).rejects.toThrow('Connect your Microsoft account');
		expect(request).not.toHaveBeenCalled();
		const h2 = authHarness();
		h2.instance.loginPopup.mockImplementationOnce(async () => { h2.changeOwner(); return { account: h2.microsoftAccount }; });
		const second = createMicrosoftProvider({ clientId: 'client', tenant: 'common' }, h2.host);
		await expect(second.connect()).rejects.toThrow('sign-in did not finish');
		expect(h2.instance.clearCache).toHaveBeenCalledOnce();
		expect(await second.status()).toMatchObject({ connected: false });
	});

	it('refuses a silent token refresh that completes after disconnect', async () => {
		const h = authHarness();
		const request = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', request);
		const provider = createMicrosoftProvider({ clientId: 'client', tenant: 'common' }, h.host);
		await provider.connect();
		h.instance.acquireTokenSilent.mockImplementationOnce(async () => { await provider.disconnect(); return { accessToken: 'old-token' }; });
		await expect(provider.list({})).rejects.toThrow('Reconnect');
		expect(request).not.toHaveBeenCalled();
	});
});
