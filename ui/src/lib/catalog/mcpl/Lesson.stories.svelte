<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Lesson from './Lesson.svelte';
	import { LESSONS } from '$lib/mcpl/lessons';

	const lesson = LESSONS.find((item) => item.id === 'set-up-your-domain') ?? LESSONS[0];
	const first = lesson.steps[0].id;

	const { Story } = defineMeta({
		title: 'MCPL/Lesson checklist',
		component: Lesson,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: { lesson, progress: { done: [], dismissed: false }, ondismiss: () => {} }
	});
</script>

<Story name="Not started" />
<Story name="One step done" args={{ progress: { done: [first], dismissed: false } }} />
<Story name="Finished" args={{ progress: { done: lesson.steps.map((step) => step.id), dismissed: false } }} />
<Story name="Admin lesson" args={{ lesson: LESSONS.find((item) => item.audience === 'admin') ?? lesson }} />
