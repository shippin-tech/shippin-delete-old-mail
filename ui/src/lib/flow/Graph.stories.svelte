<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Graph from './Graph.svelte';

	const { Story } = defineMeta({
		title: 'Flow/Graph',
		component: Graph,
		tags: ['autodocs'],
		args: {
			items: [
				{ id: 'domain', label: 'Add your domain', href: '/manage' },
				{ id: 'dns', label: 'Publish DNS records', href: '/manage', parent: 'domain' },
				{ id: 'mailbox', label: 'Create a mailbox', href: '/manage', parent: 'dns' },
				{ id: 'send', label: 'Send a message', href: '/mail/compose', parent: 'mailbox' }
			]
		},
		parameters: { layout: 'fullscreen' }
	});
</script>

{#snippet frame(args: { items: readonly { id: string; href: string; label?: string; parent?: string }[] })}
	<div style="block-size: 24rem">
		<Graph items={args.items} />
	</div>
{/snippet}

<Story name="A straight path">
	{#snippet template(args)}{@render frame(args)}{/snippet}
</Story>
<Story
	name="A tree"
	args={{
		items: [
			{ id: 'mail', label: 'Mail', href: '/mail' },
			{ id: 'compose', label: 'Compose', href: '/mail/compose', parent: 'mail' },
			{ id: 'masked', label: 'Masked addresses', href: '/mail/masked', parent: 'mail' },
			{ id: 'attach', label: 'Attachments', href: '/mail/compose', parent: 'compose' }
		]
	}}
>
	{#snippet template(args)}{@render frame(args)}{/snippet}
</Story>
<Story name="One step" args={{ items: [{ id: 'only', label: 'Only step', href: '/' }] }}>
	{#snippet template(args)}{@render frame(args)}{/snippet}
</Story>
<Story name="Nothing yet" args={{ items: [] }}>
	{#snippet template(args)}{@render frame(args)}{/snippet}
</Story>
