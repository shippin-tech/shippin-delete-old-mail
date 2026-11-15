<script lang="ts">
	import Self from './A2UINode.svelte';
	import { getPath, resolve, safeUrl } from './model';
	import type { A2UIAction, A2UIComponent, Surface } from './types';

	type Props = {
		surface: Surface;
		id: string;
		scope?: string;
		depth?: number;
		onset: (path: string, value: unknown) => void;
		onaction: (action: A2UIAction, sourceId: string, scope: string) => void;
	};
	let { surface, id, scope = '', depth = 0, onset, onaction }: Props = $props();

	const MAX_DEPTH = 24;
	const node = $derived(surface.components[id] as A2UIComponent | undefined);
	const text = (v: unknown) => {
		const r = resolve(v as never, surface.data, scope);
		return r == null ? '' : String(r);
	};
	const abs = (path: string) => (path.startsWith('/') ? path : `${scope}/${path}`);
	const items = $derived.by(() => {
		if (!node || !('children' in node)) return [] as { id: string; scope: string }[];
		const kids = node.children;
		if (Array.isArray(kids)) return kids.map((k) => ({ id: k, scope }));
		const list = getPath(surface.data, kids.path, scope);
		const base = abs(kids.path);
		return Array.isArray(list)
			? list.map((_, i) => ({ id: kids.componentId, scope: `${base}/${i}` }))
			: [];
	});
</script>

{#if node && depth < MAX_DEPTH}
	{#if node.component === 'Text'}
		{#if node.variant === 'h1'}<h1>{text(node.text)}</h1>
		{:else if node.variant === 'h2'}<h2>{text(node.text)}</h2>
		{:else if node.variant === 'h3'}<h3>{text(node.text)}</h3>
		{:else if node.variant === 'h4' || node.variant === 'h5'}<h4>{text(node.text)}</h4>
		{:else if node.variant === 'caption'}<small>{text(node.text)}</small>
		{:else}<p>{text(node.text)}</p>{/if}
	{:else if node.component === 'Code'}
		<pre class="code"><code>{text(node.text)}</code></pre>
	{:else if node.component === 'Divider'}
		<hr class:vertical={node.axis === 'vertical'} />
	{:else if node.component === 'Button'}
		<button
			type="button"
			class={node.variant ?? 'default'}
			title={node.tooltip}
			onclick={() => {
				const a = node.action;
				if ('functionCall' in a) {
					const url = safeUrl(resolve(a.functionCall.args.url, surface.data, scope));
					if (url) window.open(url, '_blank', 'noopener,noreferrer');
				} else onaction(a, node.id, scope);
			}}
		>
			<Self {surface} id={node.child} {scope} depth={depth + 1} {onset} {onaction} />
		</button>
	{:else if node.component === 'Card'}
		<div class="card"><Self {surface} id={node.child} {scope} depth={depth + 1} {onset} {onaction} /></div>
	{:else if node.component === 'Column' || node.component === 'Row' || node.component === 'List'}
		<div class={node.component.toLowerCase()} role={node.component === 'List' ? 'list' : undefined}>
			{#each items as item, i (i)}
				<Self {surface} id={item.id} scope={item.scope} depth={depth + 1} {onset} {onaction} />
			{/each}
		</div>
	{:else if node.component === 'TextField'}
		<label class="field">
			<span>{text(node.label)}</span>
			{#if node.variant === 'longText'}
				<textarea
					value={text({ path: node.value.path })}
					oninput={(e) => onset(abs(node.value.path), e.currentTarget.value)}
				></textarea>
			{:else}
				<input
					type={node.variant === 'obscured' ? 'password' : node.variant === 'number' ? 'number' : 'text'}
					autocomplete="off"
					value={text({ path: node.value.path })}
					oninput={(e) =>
						onset(
							abs(node.value.path),
							node.variant === 'number' ? e.currentTarget.valueAsNumber : e.currentTarget.value
						)}
				/>
			{/if}
		</label>
	{:else if node.component === 'CheckBox'}
		<label class="check">
			<input
				type="checkbox"
				checked={getPath(surface.data, node.value.path, scope) === true}
				onchange={(e) => onset(abs(node.value.path), e.currentTarget.checked)}
			/>
			<span>{text(node.label)}</span>
		</label>
	{:else if node.component === 'ChoicePicker'}
		{@const current = getPath(surface.data, node.value.path, scope)}
		{@const many = node.variant === 'multipleSelection'}
		<fieldset class="choice">
			{#if node.label}<legend>{text(node.label)}</legend>{/if}
			{#each node.options as option (option.value)}
				{@const picked = Array.isArray(current) ? current.includes(option.value) : current === option.value}
				<label>
					<input
						type={many ? 'checkbox' : 'radio'}
						name={`${surface.id}-${node.id}-${scope}`}
						checked={picked}
						onchange={() => {
							if (!many) return onset(abs(node.value.path), option.value);
							const list = Array.isArray(current) ? current : [];
							onset(
								abs(node.value.path),
								picked ? list.filter((v) => v !== option.value) : [...list, option.value]
							);
						}}
					/>
					<span>{option.label}</span>
				</label>
			{/each}
		</fieldset>
	{/if}
{/if}

<style>
	p, h1, h2, h3, h4, small { margin: 0; }
	.column, .list { display: grid; gap: var(--space-2); }
	.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
	.card { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-card); }
	.code { margin: 0; padding: var(--space-2) var(--space-3); overflow-x: auto; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); }
	.field { display: grid; gap: var(--space-1); }
	.field input, .field textarea { min-block-size: 2.75rem; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-bg); color: var(--color-text); font: inherit; }
	.check, .choice label { display: flex; align-items: center; gap: var(--space-2); min-block-size: 2.75rem; }
	.choice { border: 0; padding: 0; margin: 0; }
	button { min-block-size: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-card); color: var(--color-text); font: inherit; cursor: pointer; }
	button.primary { background: var(--color-accent); color: var(--color-accent-fg); border-color: transparent; font-weight: 600; }
	button.borderless { background: transparent; border-color: transparent; }
	hr { inline-size: 100%; border: 0; border-block-start: 1px solid var(--color-border); }
	hr.vertical { inline-size: 0; block-size: 100%; border-block-start: 0; border-inline-start: 1px solid var(--color-border); }
</style>
