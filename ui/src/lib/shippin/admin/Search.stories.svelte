<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Search from './Search.svelte';

	const { Story } = defineMeta({
		title: 'Admin/Search',
		component: Search,
		tags: ['autodocs'],
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Closed" />
