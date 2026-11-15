<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BarChart from './BarChart.svelte';
	import { emptySeries, gappySeries, labels, series, singleSeries } from './story-data';

	const { Story } = defineMeta({
		title: 'Dashboard/BarChart',
		component: BarChart,
		tags: ['autodocs'],
		args: { series, labels, stacked: false, mode: 'bars', format: 'number', compact: false, title: 'Messages' },
		argTypes: {
			mode: { control: 'inline-radio', options: ['bars', 'lines'] },
			format: { control: 'select', options: ['number', 'bytes', 'duration'] }
		},
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Bars" />
<Story name="Stacked bars" args={{ stacked: true }} />
<Story name="Lines" args={{ mode: 'lines' }} />
<Story name="Stacked lines" args={{ mode: 'lines', stacked: true }} />
<Story name="One series" args={{ series: singleSeries, title: 'Failed sign-ins' }} />
<Story name="Sparkline" args={{ compact: true, series: singleSeries }} />
<Story name="Nothing to show" args={{ series: emptySeries, title: 'No mail yet' }} />
<Story name="Durations with gaps" args={{ series: gappySeries, format: 'duration', mode: 'lines', title: 'Average delivery time' }} />
<Story name="Bytes" args={{ series: [{ label: 'memory', values: series[0].values.map((v) => (v ?? 0) * 40_000_000) }], format: 'bytes', title: 'Memory' }} />
