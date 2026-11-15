<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SetupAdmin from './SetupAdmin.svelte';

	const { Story } = defineMeta({
		title: 'Admin/SetupAdmin',
		component: SetupAdmin,
		tags: ['autodocs'],
		args: { oncreate: async () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Create the administrator" />
<Story name="Server refuses" args={{ oncreate: async () => { throw new Error('The setup key has expired. Restart the server for a new one.'); } }} />
