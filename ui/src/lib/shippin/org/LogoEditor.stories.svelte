<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LogoEditor from './LogoEditor.svelte';

	const { Story } = defineMeta({
		title: 'Org/LogoEditor',
		component: LogoEditor,
		tags: ['autodocs'],
		args: { domain: 'example.org', onupload: async () => {}, onremove: async () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="No logo yet" />
<Story name="Upload fails" args={{ onupload: async () => { throw new Error('The logo could not be saved.'); } }} />
<Story name="Remove fails" args={{ onremove: async () => { throw new Error('The logo could not be removed.'); } }} />
<Story name="Slow upload" args={{ onupload: () => new Promise<void>((resolve) => setTimeout(resolve, 3000)) }} />
<Story name="Long domain" args={{ domain: 'mail.a-very-long-subdomain-name.engineering.example.org' }} />
