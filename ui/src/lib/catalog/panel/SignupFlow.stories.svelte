<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SignupFlow from './SignupFlow.svelte';

	const plan = {
		signup: 'open' as const,
		dnsProof: true,
		mailboxes: 3,
		aliases: 4,
		mailboxMb: 256,
		sendsPerDay: 500,
		mailHost: 'mail.shippin.example',
		verifyLabel: '_shippin-verify'
	};

	const { Story } = defineMeta({
		title: 'Platform/Signup flow',
		component: SignupFlow,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: {
			plan,
			planError: '',
			onrequest: async (domain: string) => ({
				domain,
				record: { type: 'TXT' as const, name: `_shippin-verify.${domain}`, value: 'shippin-verify=8f3c1a9d' },
				dnsProof: true
			}),
			oncomplete: async (domain: string, name: string) => ({ email: `${name}@${domain}` })
		}
	});
</script>

<Story name="Enter your domain" />
<Story name="Plan not loaded" args={{ plan: null }} />
<Story name="Plan could not be loaded" args={{ plan: null, planError: 'Signup could not reach the server.' }} />
<Story name="Signup closed" args={{ plan: { ...plan, signup: 'closed' } }} />
<Story
	name="Domain request refused"
	args={{
		onrequest: async () => {
			throw new Error('That domain is already in use.');
		}
	}}
/>
