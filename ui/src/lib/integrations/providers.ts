import { googleProvider } from './google';
import { microsoftProvider } from './microsoft';
import type { FileProvider } from './types';

/** Adding a provider does not require changing the file browser or the mail engine. */
export function fileProviders(): FileProvider[] {
	try {
		return [googleProvider, microsoftProvider()];
	} catch (error) {
		const failed = async (): Promise<never> => {
			throw error;
		};
		return [
			googleProvider,
			{
				id: 'microsoft',
				name: 'Microsoft 365',
				description: 'OneDrive, Word, Excel and PowerPoint',
				access: 'Your administrator needs to check the Microsoft connection settings.',
				status: failed,
				connect: failed,
				disconnect: failed,
				list: failed,
				read: failed
			}
		];
	}
}
