<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import File from './File.svelte';
	import type { DriveNode } from '$lib/adapter/drive-call';

	const rights = { add: true, rename: true, remove: true, modify: true, share: true };
	const view = { add: false, rename: false, remove: false, modify: false, share: false };
	const node = (id: string, name: string, kind: 'file' | 'folder', extra: Partial<DriveNode> = {}): DriveNode => ({
		id,
		parentId: null,
		name,
		kind,
		size: kind === 'folder' ? 0 : 524288,
		type: kind === 'folder' ? '' : 'application/pdf',
		blobId: kind === 'folder' ? null : `b-${id}`,
		modified: '2026-11-10T14:20:00Z',
		rights,
		shared: false,
		...extra
	});

	const items: DriveNode[] = [
		node('f1', 'Invoices', 'folder'),
		node('f2', 'Menus', 'folder', { shared: true }),
		node('d1', 'October invoice.pdf', 'file'),
		node('d2', 'Opening checklist.html', 'file', { type: 'text/html', size: 2048 }),
		node('d3', 'A very long file name for the autumn menu photographs taken by the whole team on the first Monday.jpg', 'file', {
			type: 'image/jpeg',
			size: 6291456
		})
	];
	const folders = new Map(items.filter((item) => item.kind === 'folder').map((item) => [item.id, item]));
	const ok = async () => true;

	const { Story } = defineMeta({
		title: 'Files/Drive',
		component: File,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' },
		args: {
			title: 'My Drive',
			items,
			crumbs: [{ id: null, name: 'My Drive' }],
			folders,
			usage: { used: 734003200, limit: 5368709120 },
			uploads: [],
			notice: '',
			problem: '',
			search: '',
			scope: 'mine',
			canAdd: true,
			canSearch: true,
			canMoveToTop: false,
			selfId: 'me',
			onopen: () => {},
			onloadshares: async () => [{ principalId: 'u2', name: 'Priya Shah', role: 'viewer' as const }],
			onfindperson: async () => ({ id: 'u3', name: 'Sam Rivera' }),
			onsaveshares: ok,
			onupload: () => {},
			onnewfolder: ok,
			onrename: ok,
			onmove: ok,
			ondelete: ok,
			ondownload: () => {},
			onactivate: () => {},
			oncopytogoogle: () => {},
			onsearch: () => {},
			onclearuploads: () => {}
		}
	});
</script>

<Story name="Browse" />
<Story
	name="Search"
	args={{ title: 'Search results', search: 'invoice', items: [items[2]], crumbs: [{ id: null, name: 'My Drive' }] }}
/>
<Story name="Empty" args={{ items: [], usage: { used: 0, limit: 5368709120 } }} />
<Story
	name="Shared with me"
	args={{
		title: 'Shared with me',
		scope: 'shared',
		canAdd: false,
		canSearch: false,
		items: [
			node('s1', 'Shop floor plan.pdf', 'file', { rights: view, drive: 'priya', owner: 'Priya Shah', shared: true }),
			node('s2', 'Team photos', 'folder', { rights: view, drive: 'priya', owner: 'Priya Shah', shared: true })
		]
	}}
/>
<Story
	name="Uploading"
	args={{
		uploads: [
			{ id: 'u1', name: 'menu-photos.zip', size: 10485760, sent: 4194304, status: 'uploading', error: '' },
			{ id: 'u2', name: 'invoice.pdf', size: 245760, sent: 245760, status: 'done', error: '' },
			{ id: 'u3', name: 'huge-video.mov', size: 5368709120, sent: 0, status: 'failed', error: 'This file is larger than your storage allows.' }
		]
	}}
/>
<Story name="Storage almost full" args={{ usage: { used: 5200000000, limit: 5368709120 } }} />
<Story name="Error" args={{ items: [], problem: 'Your files could not be loaded.' }} />
