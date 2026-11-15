<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SsoEditor from './SsoEditor.svelte';

	const callback = 'https://mail.example.org/login/sso/callback';

	const { Story } = defineMeta({
		title: 'Org/SsoEditor',
		component: SsoEditor,
		tags: ['autodocs'],
		args: {
			domain: 'example.org',
			onload: async () => ({ issuer: null, clientId: null, hasSecret: false, enabled: false, callback }),
			onsave: async () => {},
			onclear: async () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Not set up" />
<Story name="Set up and on" args={{ onload: async () => ({ issuer: 'https://login.example.net', clientId: 'example-client', hasSecret: true, enabled: true, callback }) }} />
<Story name="Set up but off" args={{ onload: async () => ({ issuer: 'https://login.example.net', clientId: 'example-client', hasSecret: true, enabled: false, callback }) }} />
<Story name="Loading" args={{ onload: () => new Promise(() => {}) }} />
<Story name="Load fails" args={{ onload: async () => { throw new Error('The sign-in settings could not be loaded.'); } }} />
<Story name="Save fails" args={{ onsave: async () => { throw new Error('The provider did not answer.'); } }} />
