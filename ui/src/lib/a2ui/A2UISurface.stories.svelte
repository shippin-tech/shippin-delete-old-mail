<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import A2UISurface from './A2UISurface.svelte';
	import { applyAll } from './model';
	import { SHIPPIN_CATALOG, type A2UIMessage } from './types';

	const v = 'v0.9' as const;
	const create = (surfaceId: string): A2UIMessage => ({ version: v, createSurface: { surfaceId, catalogId: SHIPPIN_CATALOG } });

	/** Every component type in the Shippin catalog. */
	const everything = applyAll([
		create('all'),
		{
			version: v,
			updateComponents: {
				surfaceId: 'all',
				components: [
					{ id: 'root', component: 'Column', children: ['title', 'body', 'note', 'cmd', 'div', 'card', 'row', 'list'] },
					{ id: 'title', component: 'Text', text: 'Set up your domain', variant: 'h2' },
					{ id: 'body', component: 'Text', text: { path: '/intro' } },
					{ id: 'note', component: 'Text', text: 'Changes can take a few minutes to appear.', variant: 'caption' },
					{ id: 'cmd', component: 'Code', text: 'dig TXT _shippin-verify.bakery.example' },
					{ id: 'div', component: 'Divider' },
					{ id: 'card', component: 'Card', child: 'cardcol' },
					{ id: 'cardcol', component: 'Column', children: ['name', 'agree', 'plan'] },
					{ id: 'name', component: 'TextField', label: 'Mailbox name', value: { path: '/form/name' } },
					{ id: 'agree', component: 'CheckBox', label: 'I own this domain', value: { path: '/form/owner' } },
					{ id: 'plan', component: 'ChoicePicker', label: 'Plan', variant: 'mutuallyExclusive', value: { path: '/form/plan' }, options: [{ label: 'Free', value: 'free' }, { label: 'Team', value: 'team' }] },
					{ id: 'row', component: 'Row', children: ['go', 'cancel', 'docs'] },
					{ id: 'go', component: 'Button', variant: 'primary', child: 'gotext', action: { event: { name: 'domain.create', context: { name: { path: '/form/name' } } } } },
					{ id: 'gotext', component: 'Text', text: 'Create mailbox' },
					{ id: 'cancel', component: 'Button', child: 'canceltext', action: { event: { name: 'cancel' } } },
					{ id: 'canceltext', component: 'Text', text: 'Cancel' },
					{ id: 'docs', component: 'Button', variant: 'borderless', child: 'docstext', action: { functionCall: { call: 'openUrl', args: { url: 'https://shippin.tech' } } } },
					{ id: 'docstext', component: 'Text', text: 'Read the guide' },
					{ id: 'list', component: 'List', children: { path: '/steps', componentId: 'step' } },
					{ id: 'step', component: 'Text', text: { path: 'label' } }
				]
			}
		},
		{
			version: v,
			updateDataModel: {
				surfaceId: 'all',
				value: {
					intro: 'Add a mailbox for your domain. You can change it later.',
					form: { name: 'sam', owner: true, plan: 'free' },
					steps: [{ label: '1. Prove you own the domain' }, { label: '2. Create your first mailbox' }, { label: '3. Send a test message' }]
				}
			}
		}
	]).all;

	/** A form the agent asks the person to fill in; the button logs its action. */
	const form = applyAll([
		create('form'),
		{
			version: v,
			updateComponents: {
				surfaceId: 'form',
				components: [
					{ id: 'root', component: 'Card', child: 'col' },
					{ id: 'col', component: 'Column', children: ['h', 'who', 'long', 'tools', 'send'] },
					{ id: 'h', component: 'Text', text: 'Add a person to your team', variant: 'h3' },
					{ id: 'who', component: 'TextField', label: 'Their name', value: { path: '/who' } },
					{ id: 'long', component: 'TextField', label: 'Notes', variant: 'longText', value: { path: '/notes' } },
					{ id: 'tools', component: 'ChoicePicker', label: 'They can use', variant: 'multipleSelection', value: { path: '/tools' }, options: [{ label: 'Mail', value: 'mail' }, { label: 'Calendar', value: 'cal' }, { label: 'Drive', value: 'drive' }] },
					{ id: 'send', component: 'Button', variant: 'primary', child: 'sendtext', action: { event: { name: 'people.add', context: { who: { path: '/who' }, tools: { path: '/tools' } } } } },
					{ id: 'sendtext', component: 'Text', text: 'Add person' }
				]
			}
		},
		{ version: v, updateDataModel: { surfaceId: 'form', value: { who: '', notes: '', tools: ['mail'] } } }
	]).form;

	const empty = applyAll([create('empty')]).empty;

	const { Story } = defineMeta({
		title: 'A2UI/Surface',
		component: A2UISurface,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: { surface: everything, onaction: fn(), onchange: fn() }
	});
</script>

<Story name="Every component" />
<Story name="Form with logged action" args={{ surface: form }} />
<!-- A surface with no root draws nothing, never an error. -->
<Story name="No root yet" args={{ surface: empty }} />
