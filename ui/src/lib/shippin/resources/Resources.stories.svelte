<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Resources from './Resources.svelte';

	const GB = 1024 ** 3;
	const report = {
		server: { host: 'mail.example.org', memory: 1.4 * GB, disk: { total: 200 * GB, free: 120 * GB }, people: 42, domains: 6, queue: 3 },
		orgs: [
			{ id: 'o1', name: 'Example Lab', domains: ['example.org', 'lab.example.org'], people: 18, maxPeople: 25, peopleLevel: 'fine' as const, storageUsed: 22 * GB, storageHeld: 40 * GB, maxStorage: 50 * GB, storageLevel: 'fine' as const },
			{ id: 'o2', name: 'Nearly Full Co', domains: ['nearly.example.org'], people: 9, maxPeople: 10, peopleLevel: 'near' as const, storageUsed: 48 * GB, storageHeld: 50 * GB, maxStorage: 50 * GB, storageLevel: 'near' as const },
			{ id: 'o3', name: 'Over Limit Ltd', domains: ['over.example.org'], people: 12, maxPeople: 10, peopleLevel: 'over' as const, storageUsed: 60 * GB, storageHeld: 60 * GB, maxStorage: 50 * GB, storageLevel: 'over' as const },
			{ id: 'o4', name: 'No limits', domains: [], people: 0, maxPeople: 0, peopleLevel: 'none' as const, storageUsed: 0, storageHeld: 0, maxStorage: 0, storageLevel: 'none' as const }
		],
		other: { domains: 2, people: 7, storageUsed: 3 * GB }
	};

	const { Story } = defineMeta({
		title: 'Resources/Resources',
		component: Resources,
		tags: ['autodocs'],
		args: { report, notice: '' },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Mixed levels" />
<Story name="Loading" args={{ report: null, notice: 'Loading the server gauges.' }} />
<Story name="Error" args={{ report: null, notice: 'The resource report could not be loaded.' }} />
<Story name="Disk unknown" args={{ report: { ...report, server: { ...report.server, disk: null } } }} />
<Story name="Disk nearly full" args={{ report: { ...report, server: { ...report.server, disk: { total: 200 * GB, free: 4 * GB } } } }} />
<Story name="No organisations" args={{ report: { ...report, orgs: [] } }} />
