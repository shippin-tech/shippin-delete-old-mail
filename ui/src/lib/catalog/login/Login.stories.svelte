<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Login from './Login.svelte';

	const { Story } = defineMeta({
		title: 'Account/Sign in',
		component: Login,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: {
			variant: 'account',
			title: 'Sign in',
			subtitle: 'Use the address or name you were given.',
			alert: '',
			alertKind: '',
			pending: false,
			closed: false,
			submitLabel: 'Continue',
			username: '',
			deviceCode: '',
			onsubmit: () => {}
		}
	});
</script>

<Story name="Account" />
<Story name="Password" args={{ variant: 'password', username: 'sam@bakery.example', submitLabel: 'Sign in' }} />
<Story name="Device code" args={{ variant: 'device', deviceCode: 'ABCD-1234', title: 'Connect a device' }} />
<Story name="Two-factor code" args={{ variant: 'otp', title: 'Enter your code', subtitle: 'From your authenticator app.' }} />
<Story name="Checking" args={{ variant: 'password', username: 'sam@bakery.example', pending: true }} />
<Story name="Wrong password" args={{ variant: 'password', username: 'sam@bakery.example', alert: 'That password is not right.', alertKind: 'error' }} />
<Story name="Signed out" args={{ alert: 'You were signed out.', alertKind: 'success' }} />
<Story name="With company sign-in" args={{ username: 'sam@bakery.example', onsso: () => {} }} />
<Story name="Closed" args={{ closed: true, alert: 'Sign-in is closed while the server is being set up.', alertKind: 'error' }} />
