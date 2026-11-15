<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DocEditor from './DocEditor.svelte';

	const { Story } = defineMeta({
		title: 'Docs/Editor',
		component: DocEditor,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			content:
				'<h1>Opening checklist</h1><p>Before the doors open, <strong>check the ovens</strong>, restock the counter and <em>write the specials on the board</em>.</p><ul><li>Unlock the back door</li><li>Count the till</li></ul>',
			editable: true,
			onchange: () => {}
		}
	});
</script>

<Story name="Editing" />
<Story name="Read only" args={{ editable: false }} />
<Story name="Empty document" args={{ content: '' }} />
<Story name="Long document" args={{ content: '<h2>Notes</h2>' + '<p>The quick brown fox jumps over the lazy dog. </p>'.repeat(60) }} />
