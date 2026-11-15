<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RegistryEditor from './RegistryEditor.svelte';
	import { views } from '$lib/portal/catalog';
	import { domainSchema, domainRecords, domainRows, references } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/RegistryEditor',
		component: RegistryEditor,
		tags: ['autodocs'],
		args: { record: views['x:Domain'], schema: domainSchema, records: domainRecords, rows: domainRows, references, save: async (_change, id) => id, selectedId: '', total: 3, hasPrev: false, hasNext: false, onselectid: () => {}, onquerychange: () => {} },
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="List" />
<Story name="Record open" args={{ selectedId: 'd1' }} />
<Story name="Disabled record" args={{ selectedId: 'd3' }} />
<Story name="Filtered, no results" args={{ records: [], rows: [], total: 0, controls: { filterText: 'nomatch', sortBy: 'name', sortAscending: true, limit: 25, position: 0 } }} />
<Story name="Paged" args={{ total: 120, hasNext: true, controls: { filterText: '', sortBy: 'name', sortAscending: false, limit: 25, position: 25 } }} />
<Story name="Save refused" args={{ selectedId: 'd1', save: async () => { throw new Error('The domain name is already in use.'); } }} />
