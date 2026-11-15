<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AlertsAdmin from './AlertsAdmin.svelte';

	const now = Math.floor(Date.now() / 1000);
	const rules = [
		{ id: 'r1', name: 'Too many failed sign-ins', metric: 'security.authentication-error', window: '1h' as const, above: true, threshold: 20, email: ['ops@example.org'], webhook: null, enabled: true, cooldownMinutes: 60, lastFired: now - 3600 * 5, lastValue: 31 },
		{ id: 'r2', name: 'Queue stuck', metric: 'queue.count', window: '1h' as const, above: true, threshold: 500, email: [], webhook: 'https://hooks.example.org/mail-queue', enabled: false, cooldownMinutes: 30, lastFired: null, lastValue: null },
		{ id: 'r3', name: 'No mail received for a day', metric: 'queue.message-queued', window: '24h' as const, above: false, threshold: 1, email: ['ops@example.org', 'ada@example.org'], webhook: null, enabled: true, cooldownMinutes: 1440, lastFired: null, lastValue: 412 }
	];
	const metrics = [
		{ name: 'security.authentication-error', description: 'Failed sign-in attempts.' },
		{ name: 'queue.count', description: 'Messages waiting in the delivery queue.' },
		{ name: 'queue.message-queued', description: 'Messages accepted from remote senders.' }
	];

	const { Story } = defineMeta({
		title: 'Alerts/AlertsAdmin',
		component: AlertsAdmin,
		tags: ['autodocs'],
		args: {
			rules,
			metrics,
			notice: '',
			problem: '',
			result: '',
			onsave: async () => true,
			ontoggle: () => {},
			onremove: () => {},
			oncheck: () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Three rules" />
<Story name="No rules yet" args={{ rules: [] }} />
<Story name="Loading" args={{ rules: [], metrics: [], notice: 'Loading alert rules.' }} />
<Story name="Server refused" args={{ problem: 'The webhook address must start with https://.' }} />
<Story name="Check result" args={{ result: '1 of 3 rules fired on the last check.' }} />
