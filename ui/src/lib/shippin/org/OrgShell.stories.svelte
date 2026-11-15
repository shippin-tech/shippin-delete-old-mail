<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OrgShell from './OrgShell.svelte';

	const { Story } = defineMeta({
		title: 'Org/OrgShell',
		component: OrgShell,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="With a page inside">
	{#snippet template()}
		<OrgShell>
			{#snippet children()}
				<section>
					<h1>Example Lab</h1>
					<p>The organisation page appears here, beside its menu.</p>
				</section>
			{/snippet}
		</OrgShell>
	{/snippet}
</Story>
