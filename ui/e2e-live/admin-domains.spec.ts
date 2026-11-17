import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// The admin Domains screen, clicked through in a real browser: it reads and writes through
// /api/v1/registry (not JMAP), lists every domain, and creates one.
const admin = JSON.parse(
	readFileSync(resolve(process.cwd(), '../deploy/local/.credentials.json'), 'utf8')
) as { username: string; secret: string };
const basic = Buffer.from(`${admin.username}:${admin.secret}`).toString('base64');
const headers = { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' };

test('the Domains screen lists, creates and finds a domain through the registry facade', async ({
	page,
	request
}) => {
	test.setTimeout(120_000);
	const seen: { method: string; path: string; status?: number; body?: string }[] = [];
	page.on('request', (r) => {
		const path = new URL(r.url()).pathname;
		if (path.startsWith('/api/v1/registry') || path.endsWith('/jmap'))
			seen.push({ method: r.method(), path, body: r.postData() ?? undefined });
	});
	page.on('response', (r) => {
		const path = new URL(r.url()).pathname;
		const entry = [...seen].reverse().find((s) => s.path === path && s.status === undefined);
		if (entry) entry.status = r.status();
	});

	const name = `ui-${Math.random().toString(16).slice(2, 8)}.test`;
	let id = '';
	try {
		await page.goto('/login');
		await page.getByLabel('Account name').fill(admin.username);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByLabel('Password').fill(admin.secret);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.waitForURL(/\/shippin\/admin/, { timeout: 30_000 });

		await page.goto('/shippin/admin/x:Domain');
		await page.getByRole('button', { name: 'Create Domain' }).waitFor({ timeout: 30_000 });
		const rows = page.locator('table tbody tr');
		await expect(rows.first()).toBeVisible();
		// Without a page size in the address the screen asks for a page, not for one row.
		expect(await rows.count()).toBeGreaterThan(1);
		const list = seen.find((s) => s.method === 'GET' && s.path === '/api/v1/registry/Domain');
		expect(list?.status).toBe(200);
		expect(seen.some((s) => s.body?.includes('x:Domain/'))).toBe(false); // no JMAP call for it

		await page.getByRole('button', { name: 'Create Domain' }).click();
		await page.getByRole('textbox', { name: 'Domain Name' }).fill(name);
		await page.getByRole('button', { name: 'Save' }).click();
		await expect
			.poll(() => seen.find((s) => s.method === 'POST' && s.path === '/api/v1/registry/Domain')?.status, {
				timeout: 30_000
			})
			.toBe(201);

		await page.getByPlaceholder('Filter server results').fill(name);
		await page.getByPlaceholder('Filter server results').press('Enter');
		await expect(page.getByRole('button', { name: name })).toBeVisible({ timeout: 30_000 });
	} finally {
		const found = await request.get(
			`http://127.0.0.1:28081/api/v1/registry/Domain?filter=${encodeURIComponent(JSON.stringify({ text: name }))}`,
			{ headers }
		);
		id = ((await found.json()).items?.[0]?.id as string) ?? '';
		if (id) {
			const keys = await request.get('http://127.0.0.1:28081/api/v1/registry/DkimSignature?limit=200', {
				headers
			});
			for (const key of ((await keys.json()).items ?? []).filter(
				(k: { domainId?: string }) => k.domainId === id
			)) {
				await request.delete(`http://127.0.0.1:28081/api/v1/registry/DkimSignature/${key.id}`, { headers });
			}
			await request.delete(`http://127.0.0.1:28081/api/v1/registry/Domain/${id}`, { headers });
		}
	}
});
