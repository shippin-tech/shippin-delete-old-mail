<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MaskedAddresses from './MaskedAddresses.svelte';

	const addresses = [
		{ address: 'k3m9xq7tvb2n@bakery.example', accountId: 1, label: 'Online shops', enabled: true, createdAt: 1762000000 },
		{ address: 'p8d2hzr5wc4j@bakery.example', accountId: 1, label: 'Newsletter that will not stop', enabled: false, createdAt: 1761000000 },
		{ address: 'z7f1ngs6ya3e@bakery.example', accountId: 1, label: '', enabled: true, createdAt: 1760000000 }
	];

	const { Story } = defineMeta({
		title: 'Webmail/Masked addresses',
		component: MaskedAddresses,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: { addresses, limit: 50, notice: '', problem: '', oncreate: async () => true, ontoggle: () => {}, onremove: () => {} }
	});
</script>

<Story name="List" />
<Story name="Empty" args={{ addresses: [] }} />
<Story name="Limit reached" args={{ limit: 3, problem: 'You have used all 3 masked addresses. Remove one to make another.' }} />
<Story name="Notice" args={{ notice: 'Copied.' }} />
