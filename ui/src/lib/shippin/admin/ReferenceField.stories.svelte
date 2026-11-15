<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ReferenceField from './ReferenceField.svelte';
	import { references } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/ReferenceField',
		component: ReferenceField,
		tags: ['autodocs'],
		args: { name: 'x:Account', label: 'Owner', value: 'a1', load: references, onchange: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Selected" />
<Story name="Nothing chosen" args={{ value: '' }} />
<Story name="No options" args={{ load: async () => [] }} />
