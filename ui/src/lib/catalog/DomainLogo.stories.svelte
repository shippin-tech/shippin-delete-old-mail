<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DomainLogo from './DomainLogo.svelte';

	const { Story } = defineMeta({
		title: 'Brand/Domain logo',
		component: DomainLogo,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<!-- No domain: shows the product logo. -->
<Story name="No domain" args={{ domain: '' }} />
<!-- A domain with no uploaded logo falls back to the product logo once the image fails to load. -->
<Story name="Domain without a logo" args={{ domain: 'bakery.example' }} />
