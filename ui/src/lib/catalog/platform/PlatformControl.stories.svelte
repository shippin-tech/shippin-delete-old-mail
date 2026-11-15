<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PlatformControl from './PlatformControl.svelte';

	// Reads the static porting ledger bundled with the app; no network.
	const { Story } = defineMeta({
		title: 'Platform/Control ledger',
		component: PlatformControl,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Ledger" />
