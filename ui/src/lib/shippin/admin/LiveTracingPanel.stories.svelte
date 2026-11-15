<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LiveTracingPanel from './LiveTracingPanel.svelte';
	import { traceEvents } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/LiveTracingPanel',
		component: LiveTracingPanel,
		tags: ['autodocs'],
		args: { phase: 'idle', events: [], dropped: 0, onstart: () => {}, onstop: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Idle" />
<Story name="Connecting" args={{ phase: 'connecting' }} />
<Story name="Streaming" args={{ phase: 'open', events: traceEvents }} />
<Story name="Buffer full" args={{ phase: 'open', events: traceEvents, dropped: 1240 }} />
<Story name="Disconnected" args={{ phase: 'disconnected', events: traceEvents }} />
<Story name="Refused" args={{ phase: 'rejected' }} />
<Story name="Failed to start" args={{ phase: 'failed' }} />
<Story name="Signed out" args={{ phase: 'signed-out' }} />
