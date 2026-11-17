import type { IPublicClientApplication } from '@azure/msal-browser';
import { account, sessionEventName } from '../adapter/session';
import { MicrosoftGraph } from './microsoft-graph';
import type { FileProvider } from './types';

export type MicrosoftConfig = { clientId: string; tenant: string };
const READ_SCOPES = ['Files.Read'];
const CALLBACK = '/connect/microsoft/callback';

export function microsoftConfig(): MicrosoftConfig | null {
	const clientId = String(import.meta.env.VITE_MICROSOFT_CLIENT_ID ?? '').trim();
	const tenant = String(import.meta.env.VITE_MICROSOFT_TENANT_ID ?? 'common').trim();
	if (!clientId) return null;
	if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[a-z0-9.-]+$/i.test(tenant)) {
		throw new Error('The Microsoft connection settings are invalid. Ask your administrator to check them.');
	}
	return { clientId, tenant };
}

type SessionHost = {
	owner(): string;
	load(config: MicrosoftConfig): Promise<IPublicClientApplication>;
};

/** Isolated from the mail backend; public-client OAuth, delegated files access, memory cache. */
export function createMicrosoftProvider(
	config: MicrosoftConfig | null,
	host: SessionHost
): FileProvider & { reset(): Promise<void> } {
	let client: Promise<IPublicClientApplication> | null = null;
	let linkedOwner = '';
	let generation = 0;
	const app = () => {
		if (!config) throw new Error('Microsoft is not enabled for this workspace yet.');
		client ??= host.load(config).catch((error) => {
			client = null;
			throw error;
		});
		return client;
	};
	const currentOwner = () => {
		const owner = host.owner();
		if (!owner) throw new Error('Sign in to shippinTECH first.');
		return owner;
	};
	const reset = async () => {
		generation += 1;
		linkedOwner = '';
		if (client) {
			const instance = await client;
			instance.setActiveAccount(null);
			await instance.clearCache();
		}
	};
	const graph = new MicrosoftGraph(async () => {
		const owner = currentOwner();
		const epoch = generation;
		const instance = await app();
		const active = instance.getActiveAccount();
		if (linkedOwner !== owner || !active) throw new Error('Connect your Microsoft account first.');
		try {
			const result = await instance.acquireTokenSilent({ scopes: READ_SCOPES, account: active });
			if (epoch !== generation || host.owner() !== owner || linkedOwner !== owner)
				throw new Error('Session changed.');
			return result.accessToken;
		} catch {
			throw new Error('Reconnect Microsoft to continue.');
		}
	});
	return {
		id: 'microsoft',
		name: 'Microsoft 365',
		description: 'OneDrive, Word, Excel and PowerPoint',
		access:
			'Read your OneDrive files and open documents in Microsoft. Copy selected files to this device or shippinTECH Drive. Reconnect after refreshing this tab.',
		async status() {
			if (!config) return { available: false, connected: false, email: null };
			const owner = currentOwner();
			const instance = await app();
			const active = linkedOwner === owner ? instance.getActiveAccount() : null;
			return { available: true, connected: !!active, email: active?.username ?? null };
		},
		async connect() {
			const owner = currentOwner();
			const epoch = generation;
			const instance = await app();
			try {
				const result = await instance.loginPopup({ scopes: READ_SCOPES, prompt: 'select_account' });
				if (epoch !== generation || host.owner() !== owner) {
					await reset();
					throw new Error('Session changed.');
				}
				if (!result.account) throw new Error('No account returned.');
				instance.setActiveAccount(result.account);
				linkedOwner = owner;
			} catch {
				throw new Error(
					'Microsoft sign-in did not finish. Allow the sign-in popup and try again. Your organisation may require administrator approval.'
				);
			}
		},
		disconnect: reset,
		reset,
		list: (query) => graph.list(query),
		read: (file) => graph.read(file)
	};
}

let provider: ReturnType<typeof createMicrosoftProvider> | null = null;

export function microsoftProvider(): FileProvider {
	if (!provider) {
		provider = createMicrosoftProvider(microsoftConfig(), {
			owner: () => {
				const who = account();
				return who ? JSON.stringify([who.username, who.accountId]) : '';
			},
			async load(config) {
				const { createStandardPublicClientApplication, BrowserCacheLocation } = await import(
					'@azure/msal-browser'
				);
				return createStandardPublicClientApplication({
					auth: {
						clientId: config.clientId,
						authority: `https://login.microsoftonline.com/${config.tenant}`,
						redirectUri: `${window.location.origin}${CALLBACK}`
					},
					cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
					system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => undefined } }
				});
			}
		});
		window.addEventListener(sessionEventName(), () => {
			void provider?.reset().catch(() => undefined);
		});
	}
	return provider;
}
