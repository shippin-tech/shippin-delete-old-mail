<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BrandLogo from './BrandLogo.svelte';

	const { Story } = defineMeta({
		title: 'Brand/Logo',
		component: BrandLogo,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<Story name="Default" />
