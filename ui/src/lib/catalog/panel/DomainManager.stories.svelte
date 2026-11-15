<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DomainManager from './DomainManager.svelte';

	const zone = `bakery.example. IN MX 10 mail.shippin.example.
bakery.example. IN TXT "v=spf1 mx -all"
_dmarc.bakery.example. IN TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@bakery.example"
default._domainkey.bakery.example. IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"
autoconfig.bakery.example. IN CNAME mail.shippin.example.
`;
	const view = {
		domain: 'bakery.example',
		plan: { mailboxes: 3, aliases: 4, mailboxMb: 256 },
		usage: { mailboxes: 2, aliases: 1 },
		catchAll: null,
		mailHost: 'mail.shippin.example',
		dnsZone: zone
	};
	const mailboxes = [
		{ id: 'm1', name: 'sam', email: 'sam@bakery.example', owner: true, you: true, aliases: ['orders@bakery.example'], quotaBytes: 268435456, usedBytes: 52428800 },
		{ id: 'm2', name: 'priya', email: 'priya@bakery.example', owner: false, you: false, aliases: [], quotaBytes: 268435456, usedBytes: 251658240 }
	];
	const done = async () => {};

	const { Story } = defineMeta({
		title: 'Platform/Domain manager',
		component: DomainManager,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' },
		args: {
			view,
			mailboxes,
			checks: null,
			onrecheck: done,
			oncatchall: done,
			onclose: done,
			oncreate: done,
			ondelete: done,
			onpassword: done,
			onaddalias: done,
			onremovealias: done
		}
	});
</script>

<Story name="Checking DNS" />
<Story
	name="DNS all found"
	args={{
		checks: [
			{ kind: 'MX', name: 'bakery.example', expected: '10 mail.shippin.example', state: 'found', actual: '10 mail.shippin.example' },
			{ kind: 'SPF', name: 'bakery.example', expected: 'v=spf1 mx -all', state: 'found', actual: 'v=spf1 mx -all' },
			{ kind: 'DKIM', name: 'default._domainkey.bakery.example', expected: 'v=DKIM1', state: 'found', actual: 'v=DKIM1' },
			{ kind: 'DMARC', name: '_dmarc.bakery.example', expected: 'v=DMARC1', state: 'found', actual: 'v=DMARC1' }
		]
	}}
/>
<Story
	name="DNS needs attention"
	args={{
		checks: [
			{ kind: 'MX', name: 'bakery.example', expected: '10 mail.shippin.example', state: 'different', actual: '10 mx.old-host.example' },
			{ kind: 'SPF', name: 'bakery.example', expected: 'v=spf1 mx -all', state: 'missing', actual: null },
			{ kind: 'DKIM', name: 'default._domainkey.bakery.example', expected: 'v=DKIM1', state: 'missing', actual: null },
			{ kind: 'DMARC', name: '_dmarc.bakery.example', expected: 'v=DMARC1', state: 'found', actual: 'v=DMARC1' }
		]
	}}
/>
<Story name="No mailboxes yet" args={{ mailboxes: [], view: { ...view, usage: { mailboxes: 0, aliases: 0 } } }} />
<Story name="Plan full" args={{ view: { ...view, usage: { mailboxes: 3, aliases: 4 } } }} />
<Story name="Catch-all set" args={{ view: { ...view, catchAll: 'sam@bakery.example' } }} />
