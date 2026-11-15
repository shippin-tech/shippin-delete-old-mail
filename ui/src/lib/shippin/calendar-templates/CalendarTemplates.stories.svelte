<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CalendarTemplates from './CalendarTemplates.svelte';

	const templates = [
		{ id: 'invite' as const, builtIn: 'Hello {{guest}},\n\n{{organizer}} invited you to {{title}} on {{start}}.\n\n{{#if description}}{{description}}{{/if}}', custom: null },
		{ id: 'alarm' as const, builtIn: 'Reminder: {{title}} starts at {{start}}.', custom: 'Heads up! {{title}} begins at {{start}}.' }
	];

	const { Story } = defineMeta({
		title: 'Templates/CalendarTemplates',
		component: CalendarTemplates,
		tags: ['autodocs'],
		args: {
			templates,
			notice: '',
			problem: '',
			result: '',
			onsave: async () => {},
			onreset: async () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Built-in wording" />
<Story name="Loading" args={{ templates: [], notice: 'Loading the email wording.' }} />
<Story name="Server refused" args={{ problem: 'The wording uses a placeholder that does not exist.' }} />
<Story name="Saved" args={{ result: 'Saved. New invitations use this wording.' }} />
