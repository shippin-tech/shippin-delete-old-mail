<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TraceDetail from './TraceDetail.svelte';
	import { traceEvents } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/TraceDetail',
		component: TraceDetail,
		tags: ['autodocs'],
		args: { load: 'ready', events: traceEvents, onback: () => {}, onselect: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Ready" />
<Story name="Loading" args={{ load: 'loading', events: [] }} />
<Story name="Not found" args={{ load: 'missing', events: [] }} />
<Story name="Failed to load" args={{ load: 'failed', events: [] }} />
<Story name="Unresolved" args={{ load: 'unresolved', events: [] }} />
