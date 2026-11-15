<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DeliveryRunner from './DeliveryRunner.svelte';

	const { Story } = defineMeta({
		title: 'Admin/DeliveryRunner',
		component: DeliveryRunner,
		tags: ['autodocs'],
		args: { stages: [], phase: 'idle', notice: '', onstart: () => {}, onstop: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Idle" />
<Story name="Connecting" args={{ phase: 'connecting' }} />
<Story name="Running" args={{ phase: 'running', stages: [{ type: 'dns.mx-lookup', domain: 'example.net' }, { type: 'smtp.connect', host: 'mx.example.net' }] }} />
<Story name="Completed" args={{ phase: 'completed', stages: [{ type: 'dns.mx-lookup', domain: 'example.net' }, { type: 'smtp.connect', host: 'mx.example.net' }, { type: 'smtp.delivered' }] }} />
<Story name="Failed" args={{ phase: 'failed', notice: 'DNS lookup for example.invalid failed.', stages: [{ type: 'dns.mx-lookup-failed', domain: 'example.invalid' }] }} />
<Story name="Cancelled" args={{ phase: 'cancelled' }} />
