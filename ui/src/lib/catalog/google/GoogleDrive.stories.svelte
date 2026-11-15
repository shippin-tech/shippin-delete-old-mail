<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import GoogleDrive from './GoogleDrive.svelte';

	const files = [
		{ id: 'g1', name: 'Business plan', type: 'application/vnd.google-apps.document', size: null, modified: '2026-11-11T10:00:00Z', webLink: 'https://docs.example/g1', exports: ['docx', 'pdf'] },
		{ id: 'g2', name: 'Stock count', type: 'application/vnd.google-apps.spreadsheet', size: null, modified: '2026-11-09T09:30:00Z', webLink: 'https://docs.example/g2', exports: ['xlsx', 'pdf'] },
		{ id: 'g3', name: 'Photos', type: 'application/vnd.google-apps.folder', size: null, modified: '2026-10-20T09:30:00Z', webLink: '', exports: [] },
		{ id: 'g4', name: 'menu.pdf', type: 'application/pdf', size: 1048576, modified: '2026-10-01T09:30:00Z', webLink: 'https://docs.example/g4', exports: [] }
	];

	const { Story } = defineMeta({
		title: 'Files/Google Drive link',
		component: GoogleDrive,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			status: { available: true, connected: true, email: 'sam@example.org' },
			notice: '',
			problem: '',
			done: '',
			files,
			path: [{ id: 'root', name: 'My Drive' }],
			section: 'mine',
			search: '',
			more: false,
			busy: new Set<string>(),
			onconnect: () => {},
			ondisconnect: () => {},
			onsection: () => {},
			onopen: () => {},
			oncrumb: () => {},
			onsearch: () => {},
			onmore: () => {},
			onimport: () => {},
			ondownload: () => {}
		}
	});
</script>

<Story name="Browse" />
<Story name="Not available" args={{ status: { available: false, connected: false, email: null }, files: [] }} />
<Story name="Connect" args={{ status: { available: true, connected: false, email: null }, files: [] }} />
<Story name="Copied" args={{ done: 'Business plan was copied to your Drive.' }} />
<Story name="Copying" args={{ busy: new Set(['g1']) }} />
<Story name="More to load" args={{ more: true }} />
<Story name="Empty" args={{ files: [] }} />
<Story name="Error" args={{ files: [], problem: 'Google did not answer. Try again in a minute.' }} />
