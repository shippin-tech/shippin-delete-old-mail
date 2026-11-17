import { createFolder, listFolder, uploadFile } from '../adapter/drive';
import { account, authorization } from '../adapter/session';
import { type ConnectedFile, type FileProvider, MAX_TRANSFER_BYTES, transferAllowed } from './types';

export async function readForTransfer(
	provider: FileProvider,
	file: ConnectedFile,
	format?: string
): Promise<File> {
	transferAllowed(file);
	const owner = JSON.stringify(account());
	const bytes = await provider.read(file, format);
	if (JSON.stringify(account()) !== owner) throw new Error('Your sign-in changed. Try the transfer again.');
	if (bytes.size > MAX_TRANSFER_BYTES) throw new Error('This file is larger than the 100 MB transfer limit.');
	return bytes;
}

export async function copyToWorkspace(
	provider: FileProvider,
	file: ConnectedFile,
	format?: string
): Promise<void> {
	const owner = JSON.stringify(account());
	const auth = authorization();
	const stillSignedIn = () => {
		if (!auth || authorization() !== auth || JSON.stringify(account()) !== owner)
			throw new Error('Your sign-in changed. Try the copy again.');
	};
	stillSignedIn();
	const content = await readForTransfer(provider, file, format);
	stillSignedIn();
	const name = `From ${provider.name}`;
	const root = await listFolder(null);
	stillSignedIn();
	const folder =
		root.find((item) => item.kind === 'folder' && item.name === name)?.id ?? (await createFolder(null, name));
	stillSignedIn();
	await uploadFile(content, folder, () => undefined);
}

export async function downloadConnectedFile(
	provider: FileProvider,
	file: ConnectedFile,
	format?: string
): Promise<void> {
	const content = await readForTransfer(provider, file, format);
	const url = URL.createObjectURL(content);
	const link = document.createElement('a');
	link.href = url;
	link.download = content.name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
