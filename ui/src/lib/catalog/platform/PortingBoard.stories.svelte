<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PortingBoard from './PortingBoard.svelte';

	// Reads ui/porting/webui-files.json and work-packages.json at build time; no network.
	const { Story } = defineMeta({
		title: 'Platform/Web UI porting board',
		component: PortingBoard,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Remaining work" />
