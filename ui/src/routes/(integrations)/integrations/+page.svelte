<script lang="ts">
	import { onMount } from 'svelte';
	import Connections from '$lib/integrations/Connections.svelte';
	import { fileProviders } from '$lib/integrations/providers';
	import type { FileProvider } from '$lib/integrations/types';
	let providers = $state<FileProvider[]>([]);
	onMount(() => { providers = fileProviders(); });
</script>
<svelte:head><title>Connections · shippinTECH</title></svelte:head>
{#if providers.length}<Connections {providers} />{/if}
