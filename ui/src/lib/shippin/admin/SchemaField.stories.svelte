<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SchemaField from './SchemaField.svelte';
	import { domainSchema, references } from './mock';

	const { Story } = defineMeta({
		title: 'Admin/SchemaField',
		component: SchemaField,
		tags: ['autodocs'],
		args: { schema: domainSchema, references, creating: true, disabled: false, onchange: () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Text" args={{ spec: { type: 'string' }, label: 'Domain name', path: 'name', value: 'example.org' }} />
<Story name="Empty text" args={{ spec: { type: 'string' }, label: 'Domain name', path: 'name', value: '' }} />
<Story name="Number" args={{ spec: { type: 'number' }, label: 'Quota (MB)', path: 'quota', value: 512 }} />
<Story name="Checkbox" args={{ spec: { type: 'boolean' }, label: 'Enabled', path: 'isEnabled', value: true }} />
<Story name="Choice list" args={{ spec: { type: 'enum', enumName: 'CertificateManagement' }, label: 'Certificate management', path: 'cert', value: 'automatic' }} />
<Story name="Optional, unset" args={{ spec: { type: 'string', nullable: true }, label: 'Description', path: 'description', value: null }} />
<Story name="Optional, set" args={{ spec: { type: 'string', nullable: true }, label: 'Description', path: 'description', value: 'Main domain' }} />
<Story name="List of values" args={{ spec: { type: 'set', class: { type: 'string' } }, label: 'Alias', path: 'aliases', value: { 'info@example.org': true, 'sales@example.org': true } }} />
<Story name="Read only" args={{ spec: { type: 'string' }, label: 'Domain name', path: 'name', value: 'example.org', disabled: true, creating: false }} />
<Story name="Nested object" args={{ spec: { type: 'object', objectName: 'x:Domain' }, label: 'Domain', path: 'domain', value: { name: 'example.org', isEnabled: true, description: null, certificateManagement: 'manual' } }} />
