<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Copy from './Copy.svelte';

	const { Story } = defineMeta({
		title: 'Admin/Copy',
		component: Copy,
		tags: ['autodocs'],
		args: { value: 'v=spf1 mx -all', label: 'SPF record' },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Short value" />
<Story name="Long value" args={{ value: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAexampleexampleexampleexampleexampleexampleexampleexampleexample', label: 'DKIM public key' }} />
<Story name="No label" args={{ value: 'mail.example.org', label: '' }} />
