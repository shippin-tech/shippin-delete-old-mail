import type { AccountPasswordPatch } from '../contract/registry';
import { client, refusal } from './registry-facade';
import { account, authorization, openSession } from './session';

export type AppPassword = {
	id: string;
	description: string;
	createdAt: string | null;
	expiresAt: string | null;
};

/** Whether two-factor sign-in is on. The server masks the secret but keeps the field set. */
export async function loadTwoFactor(): Promise<boolean> {
	const { c } = await client();
	const result = await c.get('AccountPassword');
	if (!result.ok) throw refusal(result.problem);
	const otpUrl = result.value.otpAuth?.otpUrl;
	return typeof otpUrl === 'string' && otpUrl.length > 0;
}

async function updatePassword(patch: AccountPasswordPatch): Promise<void> {
	const { c } = await client();
	const result = await c.updatePassword(patch);
	if (!result.ok) throw refusal(result.problem);
}

export async function changePassword(current: string, next: string, code: string): Promise<void> {
	const patch: AccountPasswordPatch = { secret: next, currentSecret: current };
	if (code) patch['otpAuth/otpCode'] = code;
	await updatePassword(patch);
	// A Basic session carries the old password; reopen it so the page keeps working.
	const who = account();
	if (who && authorization()?.startsWith('Basic ')) await openSession(who.username, next);
}

export const enableTwoFactor = (current: string, otpUrl: string) =>
	updatePassword({ currentSecret: current, 'otpAuth/otpUrl': otpUrl });

export const disableTwoFactor = (current: string, code: string) =>
	updatePassword({ currentSecret: current, 'otpAuth/otpCode': code, 'otpAuth/otpUrl': null });

export async function loadAppPasswords(): Promise<AppPassword[]> {
	const { c } = await client();
	const items: AppPassword[] = [];
	let position = 0;
	const limit = 200;
	for (;;) {
		const result = await c.list('AppPassword', { position, limit });
		if (!result.ok) throw refusal(result.problem);
		const page = result.value;
		items.push(
			...page.items.map((item) => ({
				id: item.id,
				description: item.description ?? '',
				createdAt: item.createdAt ?? null,
				expiresAt: item.expiresAt ?? null
			}))
		);
		position += page.items.length;
		if (page.items.length === 0 || (page.total !== undefined ? position >= page.total : page.items.length < limit))
			return items;
	}
}

/** Returns the generated secret. The server shows it once and stores only a hash. */
export async function createAppPassword(description: string): Promise<string> {
	const { c } = await client();
	const result = await c.create('AppPassword', { description });
	if (!result.ok) throw refusal(result.problem);
	if (typeof result.value.secret !== 'string' || !result.value.secret)
		throw new Error('The server did not return the app password.');
	return result.value.secret;
}

export async function revokeAppPassword(id: string): Promise<void> {
	const { c } = await client();
	const result = await c.remove('AppPassword', id);
	if (!result.ok) throw refusal(result.problem);
}
