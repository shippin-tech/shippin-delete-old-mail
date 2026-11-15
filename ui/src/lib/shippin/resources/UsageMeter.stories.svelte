<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import UsageMeter from './UsageMeter.svelte';

	const { Story } = defineMeta({
		title: 'Resources/UsageMeter',
		component: UsageMeter,
		tags: ['autodocs'],
		args: { label: 'Storage', detail: '22 GB of 50 GB', percent: 44, level: 'fine' },
		argTypes: { level: { control: 'select', options: ['none', 'fine', 'near', 'over'] } },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Fine" />
<Story name="Near the limit" args={{ detail: '48 GB of 50 GB', percent: 96, level: 'near' }} />
<Story name="Over the limit" args={{ detail: '60 GB of 50 GB', percent: 120, level: 'over' }} />
<Story name="No limit set" args={{ detail: '3 GB used, no limit', percent: null, level: 'none' }} />
<Story name="Empty" args={{ detail: '0 B used', percent: 0, level: 'fine' }} />
<Story name="Long label" args={{ label: 'Shared storage held for every domain in this organisation', detail: '22 GB of 50 GB' }} />
