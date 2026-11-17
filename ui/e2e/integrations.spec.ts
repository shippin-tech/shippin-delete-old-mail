import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function workspace(page: Page, connected = true) {
	await page.addInitScript(() => {
		sessionStorage.setItem('shippin-basic', 'local-test-session');
		sessionStorage.setItem('shippin-account', JSON.stringify({ username: 'user@example.test', accountId: 'account' }));
	});
	const seen = { copies: [] as Record<string, unknown>[], bytes: '', disconnected: 0, searches: [] as string[] };
	await page.route('**/api/**', (route) => route.fulfill({ status: 404, json: {} }));
	await page.route('**/api/v1/me', (route) => route.fulfill({ json: { email: 'user@example.test', role: 'user', permissions: [] } }));
	await page.route('**/api/v1/google', (route) => route.fulfill({ json: { available: true, connected, email: connected ? 'google@example.test' : null } }));
	await page.route('**/api/v1/google/connect', (route) => { connected = true; return route.fulfill({ json: { url: '/integrations' } }); });
	await page.route('**/api/v1/google/disconnect', (route) => { seen.disconnected++; connected = false; return route.fulfill({ json: { connected: false } }); });
	const doc = { id: 'doc', name: 'Project brief', type: 'application/vnd.google-apps.document', size: null, modified: '', webLink: 'https://docs.google.com/document/d/doc/edit', exports: ['docx', 'pdf'] };
	await page.route('**/api/v1/google/files?*', (route) => {
		const url = new URL(route.request().url());
		const search = url.searchParams.get('search');
		if (search) seen.searches.push(search);
		const files = search === 'missing' ? [] : url.searchParams.get('folder') ? [doc] : [
			{ id: 'folder', name: 'Projects', type: 'application/vnd.google-apps.folder', exports: [] }, doc
		];
		return route.fulfill({ json: { files, nextPage: null } });
	});
	await page.route('**/api/v1/google/content/doc?*', (route) => route.fulfill({ body: 'document bytes', headers: { 'Content-Type': 'application/pdf', 'X-File-Extension': 'pdf' } }));
	await page.route('**/jmap/upload/**', (route) => { seen.bytes = route.request().postData() ?? ''; return route.fulfill({ json: { blobId: 'copied-blob' } }); });
	await page.route('**/jmap', (route) => {
		const body = route.request().postDataJSON();
		const responses = body.methodCalls.map(([method, args, id]: [string, Record<string, unknown>, string]) => {
			if (method === 'FileNode/set') { seen.copies.push(args); return [method, { created: { folder: { id: 'destination' }, file: { id: 'copied' } } }, id]; }
			return [method, { ids: [], list: [] }, id];
		});
		return route.fulfill({ json: { methodResponses: responses } });
	});
	return seen;
}

test('browse, open the original, export a copy and disconnect through the workspace', async ({ page }) => {
	const seen = await workspace(page);
	await page.goto('/integrations');
	const google = page.getByRole('article', { name: 'Google Workspace' });
	await expect(google.getByText('google@example.test', { exact: true })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Connections' })).toHaveAttribute('aria-current', 'page');
	await google.getByRole('button', { name: 'Browse files' }).click();
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Open Project brief in Google Workspace' })).toHaveAttribute('href', 'https://docs.google.com/document/d/doc/edit');
	await page.getByLabel('Export format for Project brief').selectOption('pdf');
	await page.getByRole('button', { name: 'Copy Project brief to shippinTECH Drive' }).click();
	await expect(page.getByRole('status')).toContainText('Project brief was copied');
	expect(seen.bytes).toBe('document bytes');
	expect(seen.copies).toHaveLength(2);
	expect(seen.copies[0]).toMatchObject({ accountId: 'account', create: { folder: { name: 'From Google Workspace' } } });
	expect(seen.copies[1]).toMatchObject({ accountId: 'account', onExists: 'rename', create: { file: { name: 'Project brief.pdf', parentId: 'destination', blobId: 'copied-blob' } } });
	await google.getByRole('button', { name: 'Disconnect', exact: true }).click();
	expect(seen.disconnected).toBe(0);
	await google.getByRole('button', { name: 'Confirm disconnect' }).click();
	await expect(google.getByRole('button', { name: 'Connect Google Workspace' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Google Workspace files' })).toHaveCount(0);
	expect(seen.disconnected).toBe(1);
});

test('search empty results and recover from an expired file listing', async ({ page }) => {
	await workspace(page);
	await page.goto('/integrations');
	await page.getByRole('article', { name: 'Google Workspace' }).getByRole('button', { name: 'Browse files' }).click();
	await page.getByRole('searchbox', { name: 'Search Google Workspace' }).fill('missing');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'No matching files' })).toBeVisible();
	await page.route('**/api/v1/google/files?*', (route) => route.fulfill({ status: 401, json: { message: 'Reconnect Google to continue.' } }));
	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(page.getByRole('alert')).toContainText('Reconnect Google');
	await expect(page.getByRole('article', { name: 'Google Workspace' }).getByRole('button', { name: 'Reconnect' })).toBeVisible();
});

test('connects from the hub and remains usable at phone width', async ({ page }) => {
	await workspace(page, false);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/integrations');
	await page.getByRole('button', { name: 'Connect Google Workspace' }).click();
	await expect(page.getByRole('article', { name: 'Google Workspace' }).getByText('Connected', { exact: true })).toBeVisible();
	await expect(page.getByRole('article', { name: 'Microsoft 365' })).toBeVisible();
	const result = await new AxeBuilder({ page }).include('#content').analyze();
	expect(result.violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('an unavailable provider does not prevent using the other connector', async ({ page }) => {
	await workspace(page);
	await page.route('**/api/v1/google', (route) => route.fulfill({ status: 503, json: { message: 'Google is temporarily unavailable.' } }));
	await page.goto('/integrations');
	await expect(page.getByRole('alert')).toContainText('Google is temporarily unavailable');
	await expect(page.getByRole('article', { name: 'Microsoft 365' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open my Drive' })).toBeVisible();
});

test('signed-out visitors are sent to sign in', async ({ page }) => {
	await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: {} }));
	await page.goto('/integrations');
	await expect(page).toHaveURL(/\/login/);
});

test('Microsoft popup callback does not start workspace API requests', async ({ page }) => {
	const requests: string[] = [];
	await page.route('**/api/**', (route) => { requests.push(route.request().url()); return route.fulfill({ status: 401, json: {} }); });
	await page.goto('/connect/microsoft/callback');
	await expect(page.getByRole('status')).toContainText('This sign-in could not finish');
	await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
	expect(requests).toEqual([]);
});
