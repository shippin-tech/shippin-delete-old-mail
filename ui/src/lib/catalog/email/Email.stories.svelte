<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Email from './Email.svelte';

	const message = {
		id: 'm1',
		subject: 'Friday delivery',
		preview: 'Can we move the delivery to the afternoon?',
		from: 'Priya Shah <priya@bakery.example>',
		to: 'sam@bakery.example',
		receivedAt: '2026-11-12T08:15:00Z',
		body: 'Hi Sam,\n\nCan we move the delivery to the afternoon this week? The ovens are booked until noon.\n\nThanks,\nPriya',
		truncated: false,
		attachments: []
	};

	const { Story } = defineMeta({
		title: 'Webmail/Message reader',
		component: Email,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: { message, notice: '', ondownload: async () => {} }
	});
</script>

<Story name="Reader" />
<Story
	name="With attachments"
	args={{
		message: {
			...message,
			attachments: [
				{ blobId: 'b1', name: 'delivery-schedule.pdf', type: 'application/pdf', size: 184320 },
				{ blobId: 'b2', name: 'photo-of-the-new-oven.jpg', type: 'image/jpeg', size: 4404019 }
			]
		}
	}}
/>
<Story name="Attachment download fails" args={{ message: { ...message, attachments: [{ blobId: 'b1', name: 'schedule.pdf', type: 'application/pdf', size: 1024 }] }, ondownload: async () => { throw new Error('schedule.pdf could not be downloaded.'); } }} />
<Story name="Draft" args={{ message: { ...message, draft: true } }} />
<Story name="Long message" args={{ message: { ...message, body: 'A long paragraph of text. '.repeat(200), truncated: true } }} />
<Story name="Loading" args={{ message: null, notice: 'Loading message.' }} />
<Story name="Error" args={{ message: null, notice: 'This message could not be found.' }} />
