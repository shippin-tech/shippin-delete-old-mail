<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BootstrapWizard from './BootstrapWizard.svelte';

	const { Story } = defineMeta({
		title: 'Admin/BootstrapWizard',
		component: BootstrapWizard,
		tags: ['autodocs'],
		args: { values: { serverHostname: 'mail.example.org', defaultDomain: 'example.org', requestTlsCertificate: true, generateDkimKeys: true }, ready: true, loadError: '', onchange: () => {}, onfinish: async () => ({ status: 'saved', credentials: [{ label: 'Administrator', value: 'admin' }] }) },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="First step" />
<Story name="Empty form" args={{ values: {} }} />
<Story name="Loading" args={{ ready: false }} />
<Story name="Could not load" args={{ ready: false, loadError: 'Failed to load bootstrap state.' }} />
<Story name="Server rejects" args={{ onfinish: async () => ({ status: 'rejected' }) }} />
<Story name="Server did not confirm" args={{ onfinish: async () => ({ status: 'missing' }) }} />
