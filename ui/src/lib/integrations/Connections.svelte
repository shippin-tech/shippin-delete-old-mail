<script lang="ts">
	import { onMount } from 'svelte';
	import { copyToWorkspace, downloadConnectedFile } from './transfers';
	import { fileKey, type ConnectedFile, type ConnectionStatus, type FileProvider } from './types';

	let { providers }: { providers: FileProvider[] } = $props();
	type State = { status: ConnectionStatus | null; error: string; busy: boolean };
	let states = $state<Record<string, State>>({});
	let selected = $state('');
	let files = $state<ConnectedFile[]>([]);
	let path = $state<ConnectedFile[]>([]);
	let query = $state('');
	let search = $state('');
	let cursor = $state<string | null>(null);
	let loading = $state(false);
	let problem = $state('');
	let notice = $state('');
	let transfer = $state('');
	let confirming = $state('');
	let formats = $state<Record<string, string>>({});
	let listVersion = 0;
	let statusVersion = 0;
	let disposed = false;
	const active = $derived(providers.find((provider) => provider.id === selected));
	const connected = $derived(Object.values(states).filter((state) => state.status?.connected).length);
	const labels: Record<string, string> = { docx: 'Word (.docx)', xlsx: 'Excel (.xlsx)', pptx: 'PowerPoint (.pptx)', pdf: 'PDF' };
	const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

	async function refresh() {
		const version = ++statusVersion;
		await Promise.all(providers.map(async (provider) => {
			states[provider.id] = { status: null, error: '', busy: true };
			try {
				const status = await provider.status();
				if (disposed || version !== statusVersion) return;
				states[provider.id] = { status, error: '', busy: false };
			} catch (error) {
				if (disposed || version !== statusVersion) return;
				states[provider.id] = { status: null, error: errorText(error), busy: false };
			}
		}));
	}

	onMount(() => { void refresh(); return () => { disposed = true; ++listVersion; ++statusVersion; }; });

	async function load(more = false) {
		const provider = active;
		if (!provider) return;
		const version = ++listVersion;
		loading = true;
		problem = '';
		if (!more) { files = []; cursor = null; }
		try {
			const result = await provider.list({ folder: path.at(-1), search, cursor: more ? cursor ?? undefined : undefined });
			if (disposed || version !== listVersion) return;
			files = [...new Map((more ? [...files, ...result.files] : result.files).map((file) => [fileKey(file), file])).values()];
			cursor = result.cursor;
		} catch (error) {
			if (disposed || version !== listVersion) return;
			problem = errorText(error);
		} finally {
			if (!disposed && version === listVersion) loading = false;
		}
	}

	function browse(provider: FileProvider) {
		selected = provider.id;
		path = [];
		query = search = notice = '';
		formats = {};
		void load();
	}

	async function connect(provider: FileProvider) {
		states[provider.id] = { ...states[provider.id], error: '', busy: true };
		try {
			await provider.connect();
			if (disposed) return;
			const status = await provider.status();
			if (disposed) return;
			states[provider.id] = { status, error: '', busy: false };
			if (status.connected) browse(provider);
		} catch (error) {
			if (!disposed) states[provider.id] = { ...states[provider.id], error: errorText(error), busy: false };
		}
	}

	async function disconnect(provider: FileProvider) {
		states[provider.id] = { ...states[provider.id], error: '', busy: true };
		try {
			await provider.disconnect();
			if (disposed) return;
			if (selected === provider.id) { ++listVersion; selected = ''; files = []; path = []; loading = false; }
			states[provider.id] = { status: await provider.status(), error: '', busy: false };
			confirming = '';
			notice = `${provider.name} disconnected. Files already copied stay where they are.`;
		} catch (error) {
			if (!disposed) states[provider.id] = { ...states[provider.id], error: errorText(error), busy: false };
		}
	}

	function openFolder(file: ConnectedFile) {
		path = [...path, file];
		query = search = '';
		void load();
	}

	async function moveFile(file: ConnectedFile, destination: 'workspace' | 'device') {
		if (!active || transfer) return;
		const provider = active;
		transfer = fileKey(file);
		problem = notice = '';
		try {
			const format = formats[fileKey(file)] ?? file.exports[0];
			if (destination === 'workspace') await copyToWorkspace(provider, file, format);
			else await downloadConnectedFile(provider, file, format);
			if (!disposed) notice = destination === 'workspace' ? `${file.name} was copied to From ${provider.name} in your Drive.` : `${file.name} is ready to save on this device.`;
		} catch (error) {
			if (!disposed) problem = errorText(error);
		} finally { if (!disposed) transfer = ''; }
	}

	function size(bytes: number | null): string {
		if (bytes === null) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<section class="connections">
	<header class="intro">
		<div><p class="eyebrow">YOUR CONNECTED WORKSPACE</p><h1>Work with the tools you already use.</h1><p>Bring your files together in shippinTECH. Keep editing in Google or Microsoft, and copy what you need into your own Drive.</p></div>
		<a class="button" href="/files">Open my Drive <span aria-hidden="true">↗</span></a>
	</header>
	<div class="section-title"><h2>Connections</h2><span>{connected} connected</span></div>
	<div class="providers">
		{#each providers as provider (provider.id)}
			{@const state = states[provider.id]}
			<article class:chosen={selected === provider.id} aria-label={provider.name}>
				<div class="provider-heading"><span class="monogram" class:microsoft={provider.id === 'microsoft'} aria-hidden="true">{provider.id === 'microsoft' ? 'M' : 'G'}</span><div><h3>{provider.name}</h3><p>{provider.description}</p></div></div>
				<p class="status"><span class:online={state?.status?.connected} class="dot" aria-hidden="true"></span>{state?.busy ? 'Checking connection…' : state?.error ? 'Connection needs attention' : state?.status?.connected ? 'Connected' : state?.status?.available ? 'Ready to connect' : 'Needs administrator setup'}</p>
				{#if state?.status?.email}<p class="email">{state.status.email}</p>{/if}
				<p class="access">{provider.access}</p>
				{#if state?.error}<p class="error" role="alert">{state.error}</p>{/if}
				<div class="actions">
					{#if state?.status?.connected}
						<button class="primary" disabled={!!transfer || state.busy} onclick={() => browse(provider)}>Browse files</button>
						<button disabled={!!transfer || state.busy} onclick={() => void connect(provider)}>Reconnect</button>
						<button disabled={!!transfer || state.busy} onclick={() => (confirming = provider.id)}>Disconnect</button>
					{:else if state?.status?.available}
						<button class="primary" disabled={state.busy} onclick={() => void connect(provider)}>Connect {provider.name}</button>
					{:else if state?.error}
						<button onclick={() => void refresh()}>Retry connection check</button>
					{:else if !state?.busy}
						<p class="muted">Ask your administrator to enable this connection for your workspace.</p>
					{/if}
				</div>
				{#if confirming === provider.id}
					<div class="confirmation" role="group" aria-label="Disconnect {provider.name}">
						<p>Disconnect {provider.name}? Copies in your Drive will stay.{provider.id === 'microsoft' ? ' This clears this tab’s connection; it does not sign you out of Microsoft or remove your organisation’s consent.' : ''}</p>
						<button disabled={state?.busy} onclick={() => void disconnect(provider)}>Confirm disconnect</button><button disabled={state?.busy} onclick={() => (confirming = '')}>Cancel</button>
					</div>
				{/if}
			</article>
		{/each}
	</div>
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if active}
		<section class="browser" aria-label="{active.name} files" aria-busy={loading}>
			<div class="browser-heading"><div><p class="eyebrow">{active.name}</p><h2>Your files</h2></div><button disabled={loading || !!transfer} onclick={() => void load()}>Refresh files</button></div>
			<div class="toolbar">
				<nav aria-label="Folder path"><button disabled={!!transfer} onclick={() => { path = []; query = search = ''; void load(); }}>All files</button>{#each path as folder, index (fileKey(folder))}<span aria-hidden="true">/</span><button disabled={!!transfer} aria-current={index === path.length - 1 ? 'page' : undefined} onclick={() => { path = path.slice(0, index + 1); query = search = ''; void load(); }}>{folder.name}</button>{/each}</nav>
				<form role="search" onsubmit={(event) => { event.preventDefault(); search = query.trim(); path = []; void load(); }}><label for="connected-search" class="sr">Search {active.name}</label><input id="connected-search" type="search" placeholder="Search your files" bind:value={query} /><button disabled={!!transfer}>Search</button>{#if search}<button type="button" disabled={!!transfer} onclick={() => { query = search = ''; void load(); }}>Clear search</button>{/if}</form>
			</div>
			{#if problem}<div class="error" role="alert">{problem} <button disabled={loading || !!transfer} onclick={() => void load()}>Retry file list</button></div>{/if}
			{#if loading && !files.length}<p role="status">Loading files…</p>{:else if !files.length && !problem}<div class="empty"><h3>{search ? 'No matching files' : 'This folder is empty'}</h3><p>{search ? 'Try another search or clear the search to browse.' : 'Files added in your connected account will appear here.'}</p></div>{/if}
			{#if files.length}
				<div class="table-scroll"><table><thead><tr><th scope="col">Name</th><th scope="col">Size</th><th scope="col">Actions</th></tr></thead><tbody>
				{#each files as file (fileKey(file))}
					<tr><th scope="row"><span class="file-kind" aria-hidden="true">{file.kind === 'folder' ? '▤' : '▧'}</span>{#if file.kind === 'folder'}<button class="text-button" disabled={!!transfer} onclick={() => openFolder(file)}>{file.name}</button>{:else}{file.name}{/if}</th><td class="size">{file.kind === 'folder' ? 'Folder' : size(file.size)}</td><td><div class="file-actions">
						{#if file.webUrl}<a class="button" href={file.webUrl} target="_blank" rel="noopener noreferrer" aria-label="Open {file.name} in {active.name}">Open in {active.id === 'google' ? 'Google' : 'Microsoft'} ↗</a>{/if}
						{#if file.kind === 'file'}
							{#if file.exports.length}<label class="sr" for={'format-' + fileKey(file)}>Export format for {file.name}</label><select id={'format-' + fileKey(file)} value={formats[fileKey(file)] ?? file.exports[0]} onchange={(event) => { formats[fileKey(file)] = event.currentTarget.value; }}>{#each file.exports as format}<option value={format}>{labels[format] ?? format}</option>{/each}</select>{/if}
							<button disabled={!!transfer} aria-label="Copy {file.name} to shippinTECH Drive" onclick={() => void moveFile(file, 'workspace')}>{transfer === fileKey(file) ? 'Transferring…' : 'Copy to my Drive'}</button><button disabled={!!transfer} aria-label="Download {file.name}" onclick={() => void moveFile(file, 'device')}>Download</button>
						{/if}
					</div></td></tr>
				{/each}
				</tbody></table></div>
			{/if}
			{#if cursor}<button class="more" disabled={loading || !!transfer} onclick={() => void load(true)}>{loading ? 'Loading…' : 'Show more files'}</button>{/if}
			<p class="muted footnote">Copies are separate files, up to 100 MB each. Changes to the original will not update a copy. Documents open in their provider’s editor.</p>
		</section>
	{:else}
		<section class="next"><h2>A home for your work, wherever it starts.</h2><p>Connect an account, browse its files, and bring a copy into your workspace when you need one.</p><div class="actions"><a class="button" href="/docs">My documents</a><a class="button" href="/files">My Drive</a></div></section>
	{/if}
</section>

<style>
	.connections { max-width: 88rem; margin: 0 auto; padding: clamp(1rem, 3vw, 3rem); display: grid; gap: 1.5rem; }
	h1, h2, h3, p { margin: 0; }
	h1 { font-size: clamp(1.8rem, 3.5vw, 3rem); line-height: 1.15; letter-spacing: -0.03em; margin: .65rem 0 1rem; max-width: 24ch; }
	h2 { font-size: 1.25rem; }
	h3 { font-size: 1.1rem; }
	.intro { display: flex; justify-content: space-between; align-items: center; gap: 2rem; padding-bottom: 1rem; }
	.intro p:not(.eyebrow) { max-width: 65ch; color: var(--color-muted); line-height: 1.6; }
	.eyebrow { font-size: .75rem; letter-spacing: .12em; font-weight: 700; color: var(--color-muted); }
	.section-title, .provider-heading, .browser-heading { display: flex; align-items: center; gap: 1rem; }
	.section-title, .browser-heading { justify-content: space-between; }
	.section-title > span { font-size: .875rem; color: var(--color-muted); }
	.providers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	article, .browser, .next { border: 1px solid var(--color-border); background: var(--color-card); border-radius: var(--radius); padding: 1.5rem; min-width: 0; }
	article { display: flex; flex-direction: column; gap: 1rem; }
	article.chosen { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
	.provider-heading p { color: var(--color-muted); margin-top: .3rem; font-size: .875rem; }
	.monogram { display: grid; place-items: center; width: 3rem; height: 3rem; flex-shrink: 0; font-size: 1.4rem; font-weight: 700; border: 1px solid var(--color-border); border-radius: .8rem; background: var(--color-bg); }
	.microsoft { border-radius: .25rem; }
	.status { display: flex; align-items: center; gap: .5rem; font-size: .875rem; font-weight: 600; }
	.dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--color-muted); }
	.dot.online { background: var(--color-accent); }
	.email { overflow-wrap: anywhere; font-size: .875rem; }
	.access, .muted { color: var(--color-muted); font-size: .875rem; line-height: 1.6; }
	.access { flex: 1; }
	button, .button, input, select { font: inherit; min-height: 2.75rem; padding: .6rem .85rem; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-bg); color: var(--color-text); box-sizing: border-box; }
	button, .button { cursor: pointer; }
	.button { display: inline-flex; align-items: center; justify-content: center; gap: .65rem; text-decoration: none; }
	button:disabled { opacity: .55; cursor: wait; }
	button.primary { background: var(--color-accent); color: var(--color-accent-fg); border-color: transparent; }
	button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--color-text); outline-offset: 3px; }
	.actions, .file-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
	.confirmation { border-top: 1px solid var(--color-border); padding-top: 1rem; font-size: .875rem; }
	.confirmation p { margin-bottom: .75rem; line-height: 1.5; }
	.confirmation button + button { margin-left: .5rem; }
	.browser { display: grid; gap: 1.25rem; }
	.browser-heading .eyebrow { margin-bottom: .4rem; }
	.toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
	.toolbar nav, form { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
	.toolbar nav button, .text-button { border: 0; background: transparent; padding-inline: .25rem; text-align: left; text-decoration: underline; text-underline-offset: .2em; }
	input { max-width: 100%; min-width: 0; }
	.error, .notice { padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius); line-height: 1.5; overflow-wrap: anywhere; }
	.error { border-left: 3px solid var(--color-text); }
	.notice { background: var(--color-card); }
	.table-scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: .875rem; }
	th, td { text-align: left; padding: .85rem .5rem; border-bottom: 1px solid var(--color-border); }
	thead th { color: var(--color-muted); font-weight: 500; }
	th[scope='row'] { font-weight: 500; min-width: 10rem; overflow-wrap: anywhere; }
	.file-kind { margin-right: .65rem; color: var(--color-muted); }
	.size { white-space: nowrap; }
	.file-actions { justify-content: flex-end; }
	.more { justify-self: start; }
	.empty, .next { padding: 2rem; }
	.empty p, .next p { color: var(--color-muted); margin: .65rem 0 1rem; line-height: 1.6; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	@media (max-width: 48rem) { .providers { grid-template-columns: 1fr; } .intro { align-items: flex-start; flex-direction: column; gap: 1rem; } article, .browser { padding: 1rem; } form { width: 100%; } input { flex: 1; width: 9rem; } }
</style>
