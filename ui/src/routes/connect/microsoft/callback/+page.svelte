<script lang="ts">
	import { onMount } from 'svelte';
	let message = $state('Finishing Microsoft sign-in. Keep this window open.');
	onMount(() => {
		void import('@azure/msal-browser/redirect-bridge')
			.then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
			.catch(() => { message = 'This sign-in could not finish. Close this window and reconnect from shippinTECH.'; });
	});
</script>
<svelte:head><title>Microsoft sign-in</title><meta name="referrer" content="no-referrer" /></svelte:head>
<p role="status">{message}</p>
