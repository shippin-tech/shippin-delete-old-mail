<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DashboardPanel from './DashboardPanel.svelte';
	import { stats } from './story-data';

	const { Story } = defineMeta({
		title: 'Dashboard/DashboardPanel',
		component: DashboardPanel,
		tags: ['autodocs'],
		args: {
			range: { period: '24h' },
			node: null,
			status: 'ready',
			stats,
			loading: false,
			message: '',
			tab: 'overview',
			mode: 'bars',
			updated: 1_763_000_000_000,
			onrange: () => {},
			onnode: () => {},
			ontab: () => {},
			onmode: () => {},
			onrefresh: () => {}
		},
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Overview" />
<Story name="Lines instead of bars" args={{ mode: 'lines' }} />
<Story name="Security tab" args={{ tab: 'security' }} />
<Story name="All metrics" args={{ tab: 'all' }} />
<Story name="Last 7 days" args={{ range: { period: '7d' } }} />
<Story name="Refreshing" args={{ loading: true }} />
<Story name="Loading for the first time" args={{ status: 'pending', stats: null, loading: true, updated: null }} />
<Story name="Signed out" args={{ status: 'signed-out', stats: null, message: 'Sign in to see the dashboard.' }} />
<Story name="Not allowed" args={{ status: 'forbidden', stats: null, message: 'Only server administrators can see the dashboard.' }} />
<Story name="Server error" args={{ status: 'failed', stats: null, message: 'The statistics could not be loaded.' }} />
