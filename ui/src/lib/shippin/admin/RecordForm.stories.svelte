<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RecordForm from './RecordForm.svelte';

	const { Story } = defineMeta({
		title: 'Admin/RecordForm',
		component: RecordForm,
		tags: ['autodocs'],
		args: { sections: [{ title: 'General', fields: [{ name: 'name', label: 'Domain name', type: 'string', format: '' }, { name: 'description', label: 'Description', type: 'string', format: '' }] }, { title: 'DNS', fields: [{ name: 'spf', label: 'SPF record', type: 'string', format: 'dns' }] }], picked: { name: 'example.org', description: 'Main domain', spf: 'v=spf1 mx -all' } },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Filled" />
<Story name="No record picked" args={{ picked: undefined }} />
<Story name="Long values" args={{ picked: { name: 'a-very-long-subdomain-name.departments.regional-offices.example.org', description: 'A deliberately long description that keeps going so the layout has to wrap it across several lines and still read well.', spf: 'v=spf1 ip4:203.0.113.0/24 include:_spf.example.net include:_spf.example.com mx -all' } }} />
