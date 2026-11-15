<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Mailbox from './Mailbox.svelte';

	const folders = [
		{ id: 'inbox', name: 'Inbox', unread: 3 },
		{ id: 'drafts', name: 'Drafts', unread: 0 },
		{ id: 'sent', name: 'Sent', unread: 0 },
		{ id: 'trash', name: 'Trash', unread: 0 }
	];
	const messages = [
		{ id: 'm1', subject: 'Friday delivery', from: 'Priya Shah', preview: 'Can we move the delivery to the afternoon?' },
		{ id: 'm2', subject: 'Your October invoice', from: 'Flour Mill Ltd', preview: 'The invoice for October is attached.' },
		{
			id: 'm3',
			subject: 'A very long subject line that keeps going to show how the list handles it',
			from: 'newsletter@shop.example',
			preview: 'A long preview of the message. '.repeat(10)
		}
	];

	const { Story } = defineMeta({
		title: 'Webmail/Mailbox',
		component: Mailbox,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' },
		args: { folders, messages, selectedId: 'inbox', notice: '', onselect: () => {} }
	});
</script>

<Story name="Inbox" />
<Story name="Empty folder" args={{ messages: [], selectedId: 'trash' }} />
<Story name="Loading" args={{ messages: [], notice: 'Loading messages.' }} />
<Story name="Error" args={{ messages: [], notice: 'Mail could not be loaded.' }} />
<Story name="Signed out" args={{ folders: [], messages: [], selectedId: '', notice: 'sign-in required' }} />
