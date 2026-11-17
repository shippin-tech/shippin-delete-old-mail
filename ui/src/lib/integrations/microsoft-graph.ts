import {
	boundedBlob,
	type ConnectedFile,
	type FilePage,
	type FileQuery,
	type FileRef,
	httpsLink,
	transferAllowed
} from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0/';
const FIELDS = 'id,name,size,file,folder,package,lastModifiedDateTime,webUrl,parentReference,remoteItem';
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

/** Never send a Microsoft bearer token to a provider-supplied foreign pagination URL. */
export function graphUrl(path: string): string {
	const url = new URL(path, GRAPH);
	if (
		url.origin !== 'https://graph.microsoft.com' ||
		!url.pathname.startsWith('/v1.0/') ||
		url.username ||
		url.password ||
		url.hash
	) {
		throw new Error('Microsoft returned an invalid continuation address. Refresh the file list.');
	}
	return url.href;
}

export function itemPath(ref: FileRef): string {
	if (!ref.id) throw new Error('This file has no identifier. Refresh the file list.');
	return ref.driveId
		? `drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.id)}`
		: `me/drive/items/${encodeURIComponent(ref.id)}`;
}

export function microsoftFile(value: unknown): ConnectedFile | null {
	const outer = record(value);
	const remote = record(outer.remoteItem);
	const raw = typeof remote.id === 'string' ? remote : outer;
	if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return null;
	// OneNote packages cannot be downloaded as ordinary files by this connector.
	if (raw.package && !raw.folder) return null;
	const parent = record(raw.parentReference);
	return {
		id: raw.id,
		driveId: typeof parent.driveId === 'string' ? parent.driveId : undefined,
		name: raw.name,
		kind: raw.folder ? 'folder' : 'file',
		type:
			typeof record(raw.file).mimeType === 'string'
				? (record(raw.file).mimeType as string)
				: 'application/octet-stream',
		size: typeof raw.size === 'number' && raw.size >= 0 ? raw.size : null,
		modified: typeof raw.lastModifiedDateTime === 'string' ? raw.lastModifiedDateTime : '',
		webUrl: httpsLink(raw.webUrl),
		exports: []
	};
}

export class MicrosoftGraph {
	constructor(
		private readonly token: () => Promise<string>,
		private readonly request: typeof fetch = fetch
	) {}

	private async json(path: string): Promise<RecordValue> {
		const url = graphUrl(path);
		const token = await this.token();
		const response = await this.request(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
			credentials: 'omit',
			cache: 'no-store',
			redirect: 'error'
		});
		if (!response.ok) {
			if (response.status === 401) throw new Error('Reconnect Microsoft to continue.');
			if (response.status === 403)
				throw new Error(
					'Microsoft did not allow access. Your organisation may need to approve this connection.'
				);
			if (response.status === 404)
				throw new Error('This file or OneDrive is unavailable for your Microsoft account.');
			if (response.status === 429)
				throw new Error('Microsoft is receiving too many requests. Wait a moment, then retry.');
			throw new Error('Microsoft could not load your files. Try again.');
		}
		return record(await response.json());
	}

	async list(query: FileQuery): Promise<FilePage> {
		let path = query.cursor;
		if (!path) {
			const root = query.folder ? itemPath(query.folder) : 'me/drive/root';
			const term = query.search?.trim();
			const action = term
				? `search(q='${encodeURIComponent(term.replace(/'/g, "''")).replace(/'/g, '%27')}')`
				: 'children';
			path = `${root}/${action}?${new URLSearchParams({ $select: FIELDS, $top: '100' })}`;
		}
		const body = await this.json(path);
		if (!Array.isArray(body.value)) throw new Error('Microsoft returned an unreadable file list. Try again.');
		const cursor = typeof body['@odata.nextLink'] === 'string' ? graphUrl(body['@odata.nextLink']) : null;
		return { files: body.value.flatMap((value) => microsoftFile(value) ?? []), cursor };
	}

	async read(file: ConnectedFile): Promise<File> {
		transferAllowed(file);
		const body = await this.json(
			`${itemPath(file)}?${new URLSearchParams({ $select: 'id,@microsoft.graph.downloadUrl' })}`
		);
		const url = httpsLink(body['@microsoft.graph.downloadUrl']);
		if (!url)
			throw new Error('Microsoft did not provide a download for this file. Open it in Microsoft instead.');
		// Graph's short-lived URL authorizes the download. Never forward the Graph bearer token.
		const response = await this.request(url, {
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer'
		});
		if (!response.ok) throw new Error('The Microsoft download expired or failed. Try again.');
		const bytes = await boundedBlob(response, file.type);
		return new File([bytes], file.name, { type: bytes.type });
	}
}
