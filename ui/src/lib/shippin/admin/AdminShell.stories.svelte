<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AdminShell from './AdminShell.svelte';

	const { Story } = defineMeta({
		title: 'Admin/AdminShell',
		component: AdminShell,
		tags: ['autodocs'],
		args: { active: '' },
		parameters: {
			layout: 'fullscreen',
			// The shell reads the current path to mark the open link.
			sveltekit_experimental: { state: { page: { url: new URL('http://localhost/shippin/admin') } } }
		}
	});
</script>

<Story name="Overview page">
	{#snippet template(args)}
		<AdminShell {...args}>
			<main>
				<h1>Overview</h1>
				<p>Page content goes here.</p>
			</main>
		</AdminShell>
	{/snippet}
</Story>

<Story name="Domains open" args={{ active: 'x:Domain' }} parameters={{ sveltekit_experimental: { state: { page: { url: new URL('http://localhost/shippin/admin/x:Domain') } } } }}>
	{#snippet template(args)}
		<AdminShell {...args}>
			<main>
				<h1>Domains</h1>
				<p>A list of domains would appear here.</p>
			</main>
		</AdminShell>
	{/snippet}
</Story>
