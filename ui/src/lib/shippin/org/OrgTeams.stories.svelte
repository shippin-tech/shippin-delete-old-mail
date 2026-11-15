<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgTeams from './OrgTeams.svelte';
	import { org } from './story-data';

	const many = Array.from({ length: 12 }, (_, i) => ({
		id: `t${i}`,
		name: `team-${i + 1}`,
		email: `team-${i + 1}@example.org`,
		domainId: 'd1',
		description: i % 3 === 0 ? 'A team with a rather long description that explains what it is for and who should be in it.' : ''
	}));

	const { Story } = defineMeta({
		title: 'Org/OrgTeams',
		component: OrgTeams,
		tags: ['autodocs'],
		args: { org, notice: '', problem: '', oncreate: async () => true, onremove: () => {}, onmember: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Filled" />
<Story name="Loading" args={{ org: null, notice: 'Loading teams.' }} />
<Story name="No teams yet" args={{ org: { ...org, teams: [] } }} />
<Story name="Server refused" args={{ problem: 'A team with that address already exists.' }} />
<Story name="Many teams" args={{ org: { ...org, teams: many } }} />
