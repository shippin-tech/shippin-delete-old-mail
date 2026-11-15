<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccountSecurity from './AccountSecurity.svelte';

	const done = async () => {};
	const { Story } = defineMeta({
		title: 'Account/Security',
		component: AccountSecurity,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			email: 'sam@bakery.example',
			issuer: 'Bakery Mail',
			twoFactor: false,
			appPasswords: [],
			onpassword: done,
			onenable: done,
			ondisable: done,
			oncreateapp: async () => 'abcd-efgh-ijkl-mnop',
			onrevokeapp: done
		}
	});

	const apps = [
		{ id: 'a1', description: 'Phone', createdAt: '2026-10-02T09:00:00Z', expiresAt: null },
		{ id: 'a2', description: 'Laptop mail app with a very long description so you can see how the row wraps', createdAt: '2026-11-01T18:30:00Z', expiresAt: '2027-11-01T18:30:00Z' }
	];
</script>

<Story name="Two-factor off, no app passwords" />
<Story name="Two-factor on" args={{ twoFactor: true }} />
<Story name="With app passwords" args={{ twoFactor: true, appPasswords: apps }} />
<Story
	name="Password change fails"
	args={{
		onpassword: async () => {
			throw new Error('The current password is not right.');
		}
	}}
/>
