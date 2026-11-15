<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PortalView from './PortalView.svelte';
	import { domainRows } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/PortalView',
		component: PortalView,
		tags: ['autodocs'],
		args: { onrange: () => {}, onnode: () => {}, ontab: () => {}, onmode: () => {}, onrefresh: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Dashboard, loading" args={{ view: 'CustomComponent/Dashboard', status: 'pending', stats: null, loading: true }} />
<Story name="Dashboard, nothing yet" args={{ view: 'CustomComponent/Dashboard', status: 'pending', stats: null, message: 'No statistics have been recorded yet.' }} />
<Story name="Domains list" args={{ view: 'x:Domain', phase: 'ready', rows: domainRows }} />
<Story name="Domains, empty" args={{ view: 'x:Domain', phase: 'ready', rows: [] }} />
<Story name="Domains, signed out" args={{ view: 'x:Domain', phase: 'signed-out', rows: [] }} />
<Story name="Domains, error" args={{ view: 'x:Domain', phase: 'error', rows: [], notice: 'The server could not list domains.' }} />
