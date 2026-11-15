<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TraceHistory from './TraceHistory.svelte';
	import { storedTraces, traceEvents } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/TraceHistory',
		component: TraceHistory,
		tags: ['autodocs'],
		args: { traces: storedTraces, notice: '', more: false, opened: null, onsearch: () => {}, onmore: () => {}, onopen: () => {}, onclose: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Stored traces" />
<Story name="More available" args={{ more: true }} />
<Story name="Empty" args={{ traces: [], notice: 'No stored traces match.' }} />
<Story name="Error" args={{ traces: [], notice: 'Stored traces could not be loaded.' }} />
<Story name="One opened" args={{ opened: { trace: storedTraces[0], events: traceEvents } }} />
