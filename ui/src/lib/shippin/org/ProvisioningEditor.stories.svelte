<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProvisioningEditor from './ProvisioningEditor.svelte';

	const endpoint = 'https://mail.example.org/api/v1/scim/v2';

	const { Story } = defineMeta({
		title: 'Org/ProvisioningEditor',
		component: ProvisioningEditor,
		tags: ['autodocs'],
		args: {
			domain: 'example.org',
			onload: async () => ({ hasToken: false, endpoint }),
			onmake: async () => ({ token: 'EXAMPLE-ONLY-TOKEN-NOT-REAL', endpoint }),
			onrevoke: async () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="No token yet" />
<Story name="Token exists" args={{ onload: async () => ({ hasToken: true, endpoint }) }} />
<Story name="Loading" args={{ onload: () => new Promise(() => {}) }} />
<Story name="Load fails" args={{ onload: async () => { throw new Error('The provisioning settings could not be loaded.'); } }} />
<Story name="Making a token fails" args={{ onmake: async () => { throw new Error('That could not be done.'); } }} />
