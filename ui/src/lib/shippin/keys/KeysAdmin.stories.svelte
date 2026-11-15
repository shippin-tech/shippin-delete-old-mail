<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import KeysAdmin from './KeysAdmin.svelte';
	const report = {
		wrapping: { path: '/var/lib/shippin.tech/keys/wrap', madeHere: true, readable: true },
		services: [
			{ service: 'ai', keys: [{ id: 1, origin: 'generated', kept: 'stored', place: null, state: 'primary', created: 1794700000000, readable: true }] },
			{ service: 'sso', keys: [{ id: 2, origin: 'yours', kept: 'environmentVariable', place: 'SSO_KEY', state: 'primary', created: 1794700100000, readable: true }, { id: 1, origin: 'generated', kept: 'stored', place: null, state: 'decryptOnly', created: 1794600000000, readable: true }] },
			{ service: 'google', keys: [] },
			{ service: 'domain-proof', keys: [{ id: 3, origin: 'generated', kept: 'file', place: '/run/secrets/domain-proof', state: 'primary', created: 1794700200000, readable: false }] }
		]
	};

	const { Story } = defineMeta({
		title: 'Keys/KeysAdmin',
		component: KeysAdmin,
		tags: ['autodocs'],
		args: { report, notice: '', problem: '', result: '', onauthor: async () => {}, onreplace: async () => {} },
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Keys in place" />
<Story name="Loading" args={{ report: null, notice: 'Loading.' }} />
<Story name="Missing keys" args={{ report: { ...report, services: report.services.map((s) => (s.service === 'ai' ? { ...s, keys: [] } : s)) } }} />
<Story name="Made keys" args={{ result: 'Made keys for 1 service.' }} />
<Story name="Problem" args={{ problem: 'The server could not read the key store.' }} />
