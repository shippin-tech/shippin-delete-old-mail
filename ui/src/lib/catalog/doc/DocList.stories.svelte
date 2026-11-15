<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DocList from './DocList.svelte';
	import type { DriveNode } from '$lib/adapter/drive-call';

	const rights = { add: true, rename: true, remove: true, modify: true, share: true };
	const doc = (id: string, name: string, modified: string): DriveNode => ({
		id,
		parentId: null,
		name,
		kind: 'file',
		size: 2048,
		type: 'text/html',
		blobId: `b-${id}`,
		modified,
		rights,
		shared: false
	});
	const documents: DriveNode[] = [
		doc('d1', 'Opening checklist.html', '2026-11-12T08:15:00Z'),
		doc('d2', 'Supplier contract notes.html', '2026-11-10T16:40:00Z'),
		doc('d3', 'A very long document title for the autumn menu planning meeting with everybody invited.html', '2026-10-30T11:00:00Z')
	];
	const yes = async () => true;

	const { Story } = defineMeta({
		title: 'Docs/Document list',
		component: DocList,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: { documents, notice: '', problem: '', onnew: yes, onopen: () => {}, onrename: yes, ondelete: yes }
	});
</script>

<Story name="List" />
<Story name="Empty" args={{ documents: [] }} />
<Story name="Loading" args={{ documents: [], notice: 'Loading your documents.' }} />
<Story name="Error" args={{ documents: [], problem: 'Your documents could not be loaded.' }} />
