<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Theme from './Theme.svelte';

	const { Story } = defineMeta({
		title: 'Brand/Theme switch',
		component: Theme,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: { value: 'system', onchange: () => {} }
	});
</script>

<Story name="System" args={{ value: 'system' }} />
<Story name="Light" args={{ value: 'light' }} />
<Story name="Dark" args={{ value: 'dark' }} />
