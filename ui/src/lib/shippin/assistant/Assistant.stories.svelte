<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Assistant from './Assistant.svelte';

	const { Story } = defineMeta({
		title: 'Assistant/Assistant',
		component: Assistant,
		tags: ['autodocs'],
		args: { turns: [], busy: false, problem: '', onask: async () => true },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="No questions yet" />
<Story name="Conversation" args={{ turns: [{ role: 'user', content: 'What is DKIM?' }, { role: 'assistant', content: 'DKIM signs each message you send so receiving servers can check it really came from your domain. Open Domains, pick example.org, and publish the DKIM record shown there.' }] }} />
<Story name="Thinking" args={{ busy: true, turns: [{ role: 'user', content: 'Why was my message rejected?' }] }} />
<Story name="Problem" args={{ problem: 'The assistant could not answer just now.', turns: [{ role: 'user', content: 'Why was my message rejected?' }] }} />
<Story name="Long answer" args={{ turns: [{ role: 'user', content: 'How do I set up a new domain?' }, { role: 'assistant', content: 'First add the domain under Domains. Then publish the MX, SPF, DKIM and DMARC records the page lists at your DNS provider. Wait until each row shows as verified, which can take up to an hour. Create a mailbox for the domain, send a test message to an outside address, and check that it arrives in the inbox rather than spam. If it does not, open the delivery trace for that message and read the first failure.' }] }} />
