<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import KeyNotice from './KeyNotice.svelte';

	const { Story } = defineMeta({
		title: 'Keys/KeyNotice',
		component: KeyNotice,
		tags: ['autodocs'],
		args: { variant: 'ai', detailsOpen: true },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="AI provider key" />
<Story name="Sign-in secret" args={{ variant: 'sso' }} />
<Story name="SCIM token" args={{ variant: 'scim' }} />
<Story name="App password" args={{ variant: 'app-password' }} />
<Story name="Setup key" args={{ variant: 'setup' }} />
<Story name="Details collapsed" args={{ variant: 'ai', detailsOpen: false }} />
