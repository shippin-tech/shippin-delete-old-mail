<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RecoverAdmin from './RecoverAdmin.svelte';

	const now = Math.floor(Date.now() / 1000);
	const DAY = 86400;
	const accounts = [
		{ id: 'a1', name: 'old-intern', email: 'old-intern@example.org', kind: 'Individual', deletedAt: now - 2 * DAY, until: now + 28 * DAY },
		{ id: 'a2', name: 'sales', email: 'sales@example.org', kind: 'Group', deletedAt: now - 29 * DAY, until: now + DAY / 2 }
	];
	const people = [
		{ id: 'p1', email: 'ada@example.org' },
		{ id: 'p2', email: 'grace@example.org' }
	];
	const messages = [
		{ id: 'm1', subject: 'Quarterly numbers', from: 'finance@example.net', receivedAt: now - 10 * DAY, deletedAt: now - 3 * DAY, until: now + 27 * DAY, size: 48_000 },
		{ id: 'm2', subject: '', from: 'noreply@example.com', receivedAt: now - 5 * DAY, deletedAt: now - 1 * DAY, until: now + DAY, size: 2_400_000 }
	];

	const { Story } = defineMeta({
		title: 'Recover/RecoverAdmin',
		component: RecoverAdmin,
		tags: ['autodocs'],
		args: {
			keepDays: 30,
			accounts,
			people,
			person: 'p1',
			messages,
			notice: '',
			problem: '',
			result: '',
			onperson: () => {},
			onrestoreaccount: () => {},
			onrestoremessage: () => {},
			onmore: () => {}
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Kept items" />
<Story name="Nothing kept" args={{ accounts: [], messages: [] }} />
<Story name="Keeping is off" args={{ keepDays: 0, accounts: [], messages: [] }} />
<Story name="Loading" args={{ accounts: [], messages: [], notice: 'Loading kept items.' }} />
<Story name="Restore failed" args={{ problem: 'That message could not be restored.' }} />
<Story name="Restored" args={{ result: 'Restored sales@example.org.' }} />
<Story name="A full page of messages" args={{ messages: Array.from({ length: 100 }, (_, i) => ({ ...messages[0], id: `x${i}`, subject: `Message number ${i + 1}` })) }} />
