<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgDomains from './OrgDomains.svelte';
	import { org, dns } from './story-data';

	const { Story } = defineMeta({
		title: 'Org/OrgDomains',
		component: OrgDomains,
		tags: ['autodocs'],
		args: { org, dns, notice: '', oncheck: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

{#snippet settings(domain: { id: string; name: string })}
	<p>Sign-in and provisioning settings for {domain.name} appear here.</p>
{/snippet}

<Story name="Mixed DNS status">
	{#snippet template(args)}
		<OrgDomains {...args} {settings} />
	{/snippet}
</Story>
<Story name="DNS not checked yet" args={{ dns: {} }}>
	{#snippet template(args)}
		<OrgDomains {...args} {settings} />
	{/snippet}
</Story>
<Story name="No domains" args={{ org: { ...org, domains: [] } }}>
	{#snippet template(args)}
		<OrgDomains {...args} {settings} />
	{/snippet}
</Story>
<Story name="Loading" args={{ org: null, notice: 'Loading your domains.' }}>
	{#snippet template(args)}
		<OrgDomains {...args} {settings} />
	{/snippet}
</Story>
