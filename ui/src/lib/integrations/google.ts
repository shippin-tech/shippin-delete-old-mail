import { connectGoogle, disconnectGoogle, googleStatus, listGoogle, readGoogleFile } from '../adapter/google';
import { FOLDER_TYPE, type GoogleFile } from '../adapter/google-call';
import { type ConnectedFile, type FileProvider, httpsLink, transferAllowed } from './types';

function normalize(file: GoogleFile): ConnectedFile {
	return { ...file, kind: file.type === FOLDER_TYPE ? 'folder' : 'file', webUrl: httpsLink(file.webLink) };
}

export const googleProvider: FileProvider = {
	id: 'google',
	name: 'Google Workspace',
	description: 'Google Drive, Docs, Sheets and Slides',
	access:
		'Browse and copy files. Export Google documents as Office files or PDF. Your existing Google connection also supports copying files back from Drive.',
	status: googleStatus,
	connect: connectGoogle,
	disconnect: disconnectGoogle,
	async list(query) {
		const page = await listGoogle({ folder: query.folder?.id, search: query.search, page: query.cursor });
		return { files: page.files.map(normalize), cursor: page.nextPage };
	},
	async read(file, format) {
		transferAllowed(file);
		return readGoogleFile({ ...file, webLink: file.webUrl }, format);
	}
};
