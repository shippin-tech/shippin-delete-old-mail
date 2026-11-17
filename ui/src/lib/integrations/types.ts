/** Provider contracts contain no mail-engine types, credentials or provider SDK objects. */
export type ConnectionStatus = { available: boolean; connected: boolean; email: string | null };
export type FileRef = { id: string; driveId?: string };
export type ConnectedFile = FileRef & {
	name: string;
	kind: 'file' | 'folder';
	type: string;
	size: number | null;
	modified: string;
	webUrl: string;
	exports: string[];
};
export type FileQuery = { folder?: FileRef; search?: string; cursor?: string };
export type FilePage = { files: ConnectedFile[]; cursor: string | null };
export interface FileProvider {
	id: string;
	name: string;
	description: string;
	access: string;
	status(): Promise<ConnectionStatus>;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	list(query: FileQuery): Promise<FilePage>;
	read(file: ConnectedFile, format?: string): Promise<File>;
}

export const MAX_TRANSFER_BYTES = 100 * 1024 * 1024;

export function httpsLink(value: unknown): string {
	if (typeof value !== 'string') return '';
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
	} catch {
		return '';
	}
}

export function fileKey(file: FileRef): string {
	return JSON.stringify([file.driveId ?? '', file.id]);
}

export function transferAllowed(file: ConnectedFile): void {
	if (file.kind !== 'file') throw new Error('Open the folder and choose a file to copy.');
	if (file.size !== null && file.size > MAX_TRANSFER_BYTES) {
		throw new Error('Choose a file smaller than 100 MB.');
	}
}

/** Bound memory even when a provider omits or misreports Content-Length. */
export async function boundedBlob(response: Response, fallbackType: string): Promise<Blob> {
	const length = Number(response.headers.get('Content-Length'));
	if (Number.isFinite(length) && length > MAX_TRANSFER_BYTES) {
		await response.body?.cancel();
		throw new Error('This file is larger than the 100 MB transfer limit.');
	}
	if (!response.body) throw new Error('The provider returned no file content.');
	const reader = response.body.getReader();
	const chunks: ArrayBuffer[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_TRANSFER_BYTES) {
				await reader.cancel();
				throw new Error('This file is larger than the 100 MB transfer limit.');
			}
			chunks.push(new Uint8Array(value).buffer);
		}
	} finally {
		reader.releaseLock();
	}
	return new Blob(chunks, { type: response.headers.get('Content-Type') || fallbackType });
}
