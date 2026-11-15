<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TraceTimeline from './TraceTimeline.svelte';
	import { traceEvents } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/TraceTimeline',
		component: TraceTimeline,
		tags: ['autodocs'],
		args: { events: traceEvents, onselect: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Delivery with a failure" />
<Story name="Empty" args={{ events: [] }} />
<Story name="Many events" args={{ events: [...traceEvents, ...traceEvents, ...traceEvents, ...traceEvents] }} />
