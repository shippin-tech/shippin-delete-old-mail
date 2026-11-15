<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgsPortal from './OrgsPortal.svelte';
	import { domains, organisations } from './story-data';

	const { Story } = defineMeta({
		title: 'Org/OrgsPortal',
		component: OrgsPortal,
		tags: ['autodocs'],
		args: {
			orgs: organisations,
			domains,
			notice: '',
			problem: '',
			onsave: async () => true,
			onremove: () => {},
			onlogo: async () => {},
			onlogoremove: async () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

{#snippet sso(domain: string)}
	<p>Sign-in settings for domain {domain} appear here.</p>
{/snippet}

<Story name="Two organisations">
	{#snippet template(args)}
		<OrgsPortal {...args} {sso} />
	{/snippet}
</Story>
<Story name="Empty" args={{ orgs: [] }} />
<Story name="Server refused" args={{ problem: 'That domain already belongs to another organisation.' }} />
<Story name="Saved notice" args={{ notice: 'Saved Example Lab.' }} />
