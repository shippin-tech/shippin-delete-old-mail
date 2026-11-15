<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PeopleAdmin from './PeopleAdmin.svelte';

	const GB = 1024 ** 3;
	const domains = [
		{ id: 'd1', name: 'example.org' },
		{ id: 'd2', name: 'lab.example.org' }
	];
	const people = [
		{ id: 'p1', name: 'ada', domainId: 'd1', email: 'ada@example.org', fullName: 'Ada Lovelace', role: 'admin' as const, used: 1.2 * GB, limit: 5 * GB, teamIds: ['t1'], passwordKey: 'k1', createdAt: '2026-10-01T09:00:00Z' },
		{ id: 'p2', name: 'grace', domainId: 'd1', email: 'grace@example.org', fullName: 'Grace Hopper', role: 'user' as const, used: 4.8 * GB, limit: 5 * GB, teamIds: ['t1'], passwordKey: 'k2', createdAt: '2026-10-04T09:00:00Z' },
		{ id: 'p3', name: 'alan', domainId: 'd2', email: 'alan@lab.example.org', fullName: '', role: 'custom' as const, used: 0, limit: null, teamIds: [], passwordKey: null, createdAt: '2026-11-01T09:00:00Z' }
	];
	const teams = [{ id: 't1', name: 'support', domainId: 'd1', email: 'support@example.org', description: 'Shared support inbox' }];

	const { Story } = defineMeta({
		title: 'People/PeopleAdmin',
		component: PeopleAdmin,
		tags: ['autodocs'],
		args: {
			people,
			teams,
			domains,
			notice: '',
			problem: '',
			selfEmail: 'ada@example.org',
			onaddperson: async () => true,
			onsaveperson: async () => true,
			onremoveperson: async () => true,
			onaddteam: async () => true,
			onremoveteam: async () => true,
			onmember: async () => true
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Filled" />
<Story name="Empty" args={{ people: [], teams: [] }} />
<Story name="Loading" args={{ people: [], teams: [], notice: 'Loading people.' }} />
<Story name="Server refused" args={{ problem: 'That address is already in use on this server.' }} />
<Story name="Saved notice" args={{ notice: 'Saved grace@example.org.' }} />
<Story name="Many people" args={{ people: Array.from({ length: 40 }, (_, i) => ({ ...people[1], id: `m${i}`, name: `person${i}`, email: `person${i}@example.org`, fullName: `Person Number ${i}` })) }} />
