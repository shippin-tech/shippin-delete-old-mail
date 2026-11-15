<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgPeople from './OrgPeople.svelte';
	import { org, fullOrg } from './story-data';

	const { Story } = defineMeta({
		title: 'Org/OrgPeople',
		component: OrgPeople,
		tags: ['autodocs'],
		args: {
			org,
			notice: '',
			problem: '',
			onadd: async () => true,
			onsave: async () => true,
			onremove: () => {},
			onaddalias: async () => true,
			onremovealias: () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Filled" />
<Story name="Loading" args={{ org: null, notice: 'Loading people.' }} />
<Story name="Empty" args={{ org: { ...org, people: [] } }} />
<Story name="Server refused the change" args={{ problem: 'That address is already in use on this server.' }} />
<Story name="Person limit reached" args={{ org: fullOrg, notice: 'Your organisation is at its limit of 3 people.' }} />
<Story name="Saved notice" args={{ notice: 'Saved grace@example.org.' }} />
