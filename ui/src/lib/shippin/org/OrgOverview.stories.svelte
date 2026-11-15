<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgOverview from './OrgOverview.svelte';
	import { org, fullOrg } from './story-data';

	const { Story } = defineMeta({
		title: 'Org/OrgOverview',
		component: OrgOverview,
		tags: ['autodocs'],
		args: { org, notice: '' },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Filled" />
<Story name="Loading" args={{ org: null, notice: 'Loading your organisation.' }} />
<Story name="Error" args={{ org: null, notice: 'Sign in again to see your organisation.' }} />
<Story name="At the limits" args={{ org: fullOrg }} />
<Story name="Long name" args={{ org: { ...org, name: 'The International Association of Independent Mail Hosting Cooperatives and Allied Societies' } }} />
