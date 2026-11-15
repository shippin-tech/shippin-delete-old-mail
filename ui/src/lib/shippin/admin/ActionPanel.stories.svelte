<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ActionPanel from './ActionPanel.svelte';
	import { actionSchema, references } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/ActionPanel',
		component: ActionPanel,
		tags: ['autodocs'],
		args: { schema: actionSchema, references, execute: async () => ({ result: 'Reloaded 2 certificates.' }) },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Choose an action" />
<Story name="Action fails" args={{ execute: async () => { throw new Error('The server refused the action.'); } }} />
<Story name="No actions" args={{ schema: { ...actionSchema, schemas: {} } }} />
