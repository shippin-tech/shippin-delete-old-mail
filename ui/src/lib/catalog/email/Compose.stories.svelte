<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Compose from './Compose.svelte';

	const blank = { to: '', cc: '', subject: '', body: '', attachments: [], inReplyTo: [], references: [], draftId: null };
	const { Story } = defineMeta({
		title: 'Webmail/Compose',
		component: Compose,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			draft: blank,
			from: 'sam@bakery.example',
			title: 'New message',
			onsend: async () => {},
			onsave: async () => 'draft-1',
			onupload: async (file: File) => ({ blobId: 'blob-1', name: file.name, type: file.type, size: file.size }),
			ondone: () => {}
		}
	});
</script>

<Story name="Blank" />
<Story
	name="Reply"
	args={{
		title: 'Reply',
		draft: {
			...blank,
			to: 'priya@bakery.example',
			subject: 'Re: Friday delivery',
			body: '\n\nOn Monday Priya Shah wrote:\n> Can we move the delivery to the afternoon?',
			inReplyTo: ['<m1@bakery.example>']
		}
	}}
/>
<Story
	name="With copy and attachment"
	args={{
		draft: {
			...blank,
			to: 'priya@bakery.example',
			cc: 'sam@bakery.example, accounts@bakery.example',
			subject: 'October invoice',
			body: 'Hi Priya,\n\nThe invoice is attached.\n\nThanks!',
			attachments: [{ blobId: 'b1', name: 'invoice-october.pdf', type: 'application/pdf', size: 245760 }]
		}
	}}
/>
<Story
	name="Send fails"
	args={{
		draft: { ...blank, to: 'priya@bakery.example', subject: 'Hello', body: 'Hi!' },
		onsend: async () => {
			throw new Error('The server refused the message. Try again in a minute.');
		}
	}}
/>
<Story
	name="Long text"
	args={{
		draft: { ...blank, to: 'priya@bakery.example', subject: 'Notes from the long planning meeting '.repeat(4), body: 'A long paragraph of text. '.repeat(120) }
	}}
/>
