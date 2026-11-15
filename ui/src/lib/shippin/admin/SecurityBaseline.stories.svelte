<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SecurityBaseline from './SecurityBaseline.svelte';
	import { BASELINES } from '$lib/portal/baseline';

	const { Story } = defineMeta({
		title: 'Admin/SecurityBaseline',
		component: SecurityBaseline,
		tags: ['autodocs'],
		args: { baselines: BASELINES, records: {}, busy: '', notice: '', onapply: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Nothing applied" />
<Story name="Applying one" args={{ busy: 'transport' }} />
<Story name="Server notice" args={{ notice: 'The server did not confirm the change.' }} />
<Story name="Not loaded" args={{ baselines: [], notice: 'Loading the server settings.' }} />
