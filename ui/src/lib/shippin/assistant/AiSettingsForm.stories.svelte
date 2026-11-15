<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AiSettingsForm from './AiSettingsForm.svelte';

	const { Story } = defineMeta({
		title: 'Assistant/AiSettingsForm',
		component: AiSettingsForm,
		tags: ['autodocs'],
		args: { saved: null, notice: '', problem: '', result: '', onsave: async () => {}, ontest: async () => {}, onclear: async () => {} },
		parameters: { layout: 'padded' }
	});
</script>

<Story name="Not set up" />
<Story name="Loading" args={{ notice: 'Loading.' }} />
<Story name="Saved, key held" args={{ saved: { kind: 'openai', endpoint: 'https://api.example.org/v1', model: 'example-model', hasKey: true, assistant: true } }} />
<Story name="Saved, no key (local model)" args={{ saved: { kind: 'openai', endpoint: 'http://models.internal:11434/v1', model: 'local-model', hasKey: false, assistant: false } }} />
<Story name="Test passed" args={{ saved: { kind: 'anthropic', endpoint: 'https://api.example.org', model: 'example-model', hasKey: true, assistant: true }, result: 'The model answered.' }} />
<Story name="Problem" args={{ saved: null, problem: 'The server could not reach the model address.' }} />
