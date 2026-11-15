<script lang="ts">
	import A2UINode from './A2UINode.svelte';
	import { resolve, setPath } from './model';
	import type { A2UIAction, A2UIUserAction, Surface } from './types';

	type Props = {
		surface: Surface;
		/** The person's action. The host decides what it does; a surface never writes by itself. */
		onaction?: (action: A2UIUserAction) => void;
		/** After the person edits a field, with the whole data model. */
		onchange?: (data: unknown) => void;
	};
	let { surface, onaction, onchange }: Props = $props();

	let edits = $state<unknown>(undefined);
	// A new model from the agent replaces the person's typing.
	$effect(() => {
		void surface.data;
		edits = undefined;
	});
	const view = $derived<Surface>({ ...surface, data: edits ?? surface.data });

	function set(path: string, value: unknown) {
		edits = setPath(edits ?? surface.data, path, value);
		onchange?.(edits);
	}
	function act(action: A2UIAction, sourceId: string, scope: string) {
		if (!('event' in action)) return;
		const context: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(action.event.context ?? {}))
			context[k] = resolve(v as never, view.data, scope);
		onaction?.({
			name: action.event.name,
			surfaceId: surface.id,
			sourceComponentId: sourceId,
			timestamp: new Date().toISOString(),
			context
		});
	}
</script>

{#if 'root' in surface.components}
	<div class="a2ui" data-surface={surface.id}>
		<A2UINode surface={view} id="root" onset={set} onaction={act} />
	</div>
{/if}
