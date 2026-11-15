import { Me, parse } from '../contract/v1';
import { authorization } from './session';

/** guest: signed out. user: a mailbox. owner: runs a self-service domain. admin: operates the server. */
export type Role = 'guest' | 'user' | 'owner' | 'org' | 'admin';

let cached: { auth: string; role: Role } | null = null;

/** The server decides the role (GET /api/v1/me); this only asks. */
export async function currentRole(): Promise<Role> {
	const auth = authorization();
	if (!auth) return 'guest';
	if (cached?.auth === auth) return cached.role;
	try {
		const res = await fetch('/api/v1/me', {
			headers: { Authorization: auth, Accept: 'application/json' },
			cache: 'no-store',
			credentials: 'same-origin'
		});
		const parsed = parse(Me, await res.json().catch(() => null));
		if (parsed.ok) {
			cached = { auth, role: parsed.value.role };
			return parsed.value.role;
		}
		// A 401 from a proxy may carry no problem document, so the status is read too.
		if (res.status === 401 || parsed.problem.status === 401) return 'guest';
		// A contract break is shown, not hidden. The lowest role is the safe one to present, and it
		// is remembered for this sign-in so a broken server is not asked again on every navigation.
		console.error('GET /api/v1/me', parsed.problem);
		cached = { auth, role: 'user' };
		return 'user';
	} catch {
		return 'user';
	}
}

export function forgetRole(): void {
	cached = null;
}

export function homeFor(role: Role): string {
	switch (role) {
		case 'guest':
			return '/login';
		case 'owner':
			return '/manage';
		case 'org':
			return '/shippin/org';
		case 'admin':
			return '/shippin/admin';
		default:
			return '/mail';
	}
}

export type NavItem = { href: string; label: string };

export function navFor(role: Role, signupOpen: boolean): NavItem[] {
	const mail = [
		{ href: '/mail', label: 'Mail' },
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/contacts', label: 'Contacts' },
		{ href: '/account', label: 'Account' }
	];
	switch (role) {
		case 'guest':
			return signupOpen ? [{ href: '/signup', label: 'Create free account' }] : [];
		case 'owner':
			return [{ href: '/manage', label: 'My domain' }, ...mail];
		case 'org':
			return [{ href: '/shippin/org', label: 'Organisation' }, ...mail];
		case 'admin':
			return [
				{ href: '/shippin/admin', label: 'Admin' },
				{ href: '/platform', label: 'Platform' },
				...mail,
				{ href: '/files', label: 'Drive' },
				{ href: '/docs', label: 'Docs' }
			];
		default:
			return mail;
	}
}
