<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RecordTable from './RecordTable.svelte';
	import { domainRows } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/RecordTable',
		component: RecordTable,
		tags: ['autodocs'],
		args: { columns: [{ name: 'name', label: 'Domain Name' }, { name: 'isEnabled', label: 'Enabled' }, { name: 'certificateManagement', label: 'Certificate Management' }, { name: 'dnsManagement', label: 'DNS Management' }], rows: domainRows, phase: 'ready', selected: null, onselect: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Rows" />
<Story name="Row selected" args={{ selected: 1 }} />
<Story name="Loading" args={{ phase: 'pending', rows: [] }} />
<Story name="Empty" args={{ phase: 'ready', rows: [] }} />
<Story name="Signed out" args={{ phase: 'signed-out', rows: [] }} />
<Story name="Error" args={{ phase: 'error', rows: [] }} />
