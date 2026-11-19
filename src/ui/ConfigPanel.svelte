<script lang="ts">
  import type { ConfigStore } from '../config/store.svelte';
  import { describeSource } from '../config/store.svelte';
  import { parseConfigText, serialiseConfig, MAX_CONFIG_BYTES, type ConfigError } from '../config/parse';
  import type { Config } from '../config/schema';
  import { encodeConfigHash } from '../share/url';
  import { loadRepoConfig, parseRepoRef, DEFAULT_REPO_PATH } from '../share/repo';
  import { scrubToken, type Client } from '../github/client';
  import Icon from './Icon.svelte';

  let { store, client, token, onApplied }: { store: ConfigStore; client: Client | null; token: string | null; onApplied: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(serialiseConfig($state.snapshot(store.config) as Config));
  let errors = $state<ConfigError[]>([]);
  let message = $state<string | null>(null);
  let repo = $state('');
  let busy = $state(false);

  function reload() { text = serialiseConfig($state.snapshot(store.config) as Config); errors = []; }

  function apply() {
    const res = parseConfigText(text);
    if (!res.ok) { errors = res.errors; return; }
    errors = [];
    store.replace(res.config, { kind: 'local' });
    message = res.migratedFrom ? `Applied. Upgraded from version ${res.migratedFrom}.` : 'Applied and saved.';
    onApplied();
  }

  function download(format: 'yaml' | 'json') {
    const body = serialiseConfig($state.snapshot(store.config) as Config, format);
    const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'json' ? 'prboard.json' : 'prboard.yml';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_CONFIG_BYTES) { errors = [{ path: '(file)', message: 'file is larger than 256 KB' }]; return; }
    const res = parseConfigText(await file.text());
    if (!res.ok) { errors = res.errors; return; }
    errors = [];
    store.replace(res.config, { kind: 'file', name: file.name });
    reload();
    message = `Loaded ${file.name}. Click "Keep this config" in the banner to save it.`;
    onApplied();
  }

  async function copyLink() {
    const hash = await encodeConfigHash($state.snapshot(store.config) as Config);
    const link = scrubToken(location.origin + location.pathname + hash, token);
    try {
      await navigator.clipboard.writeText(link);
      message = `Link copied (${link.length.toLocaleString()} characters). It holds only the config, never your token.`;
    } catch {
      message = 'Could not copy. Your browser blocked clipboard access.';
    }
  }

  async function loadRepo(e: SubmitEvent) {
    e.preventDefault();
    const ref = parseRepoRef(repo);
    if (!ref) { errors = [{ path: '(repo)', message: 'use owner/name, owner/name@branch or owner/name@branch:path' }]; return; }
    if (!client) return;
    busy = true;
    try {
      const res = await loadRepoConfig(client, ref);
      if (!res.ok) { errors = res.errors; return; }
      errors = [];
      store.replace(res.config, { kind: 'repo', name: `${ref.owner}/${ref.name}` });
      reload();
      message = `Loaded ${ref.path} from ${ref.owner}/${ref.name}.`;
      onApplied();
    } catch (err) {
      errors = [{ path: '(repo)', message: (err as Error).message }];
    } finally {
      busy = false;
    }
  }
</script>

<div class="panel">
  <p class="source"><span class="dot" class:unsaved={store.unsaved}></span>Active: <strong>{describeSource(store.source)}</strong>{#if store.unsaved}<span class="muted"> · not saved</span>{/if}</p>

  <div class="fieldset">
    <label class="field-label" for="cfg">YAML or JSON</label>
    <textarea id="cfg" bind:value={text} spellcheck="false" rows="18"></textarea>
    {#if errors.length}
      <ul class="errors" role="alert">
        {#each errors as e, i (i)}<li><code>{e.path}</code> {e.message}</li>{/each}
      </ul>
    {/if}
    <div class="row">
      <button class="primary" onclick={apply}>Apply</button>
      <button class="ghost" onclick={reload}>Revert</button>
    </div>
  </div>

  <div class="fieldset">
    <span class="field-label">Share and back up</span>
    <div class="grid2">
      <button onclick={copyLink}><Icon id="link" /> Copy share link</button>
      <label class="file"><Icon id="upload" /> Import file<input type="file" accept=".yml,.yaml,.json,application/json,text/yaml" onchange={importFile} /></label>
      <button onclick={() => download('yaml')}><Icon id="download" /> YAML</button>
      <button onclick={() => download('json')}><Icon id="download" /> JSON</button>
    </div>
  </div>

  <form class="fieldset" onsubmit={loadRepo}>
    <label class="field-label" for="cfg-repo">Load from a repository</label>
    <div class="row">
      <input id="cfg-repo" class="grow" placeholder="owner/repo" bind:value={repo} spellcheck="false" />
      <button type="submit" disabled={busy || !repo.trim()}>{busy ? 'Loading…' : 'Load'}</button>
    </div>
    <p class="hint">Reads <code>{DEFAULT_REPO_PATH}</code>. Use <code>owner/repo@branch:path</code> for another file.</p>
  </form>

  {#if message}<p class="msg"><Icon id="check" size={13} /> {message}</p>{/if}

  <div class="danger-zone">
    <button class="danger" onclick={() => { if (confirm('Replace your config with the built-in default?')) { store.resetToDefault(); reload(); onApplied(); } }}>Reset to default</button>
  </div>
</div>

<style>
  .panel { display: grid; gap: 20px; }
  .source { margin: 0; font-size: 12px; color: var(--fg-soft); display: flex; align-items: center; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--good); }
  .dot.unsaved { background: var(--warn); }
  .muted { color: var(--muted); }
  .fieldset { display: grid; gap: 8px; }
  .fieldset .field-label { margin-bottom: 0; }
  textarea { width: 100%; font-family: var(--mono); font-size: 12px; resize: vertical; background: var(--bg-sunken); tab-size: 2; white-space: pre; overflow: auto; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .grow { flex: 1; min-width: 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .file { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 10px; font-size: 13px; font-weight: 500;
    color: var(--fg-soft); border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg-raised); cursor: pointer; transition: background-color .12s, border-color .12s; }
  .file:hover { background: var(--hover); border-color: var(--border-strong); color: var(--fg); }
  .file:focus-within { box-shadow: var(--ring); border-color: var(--accent); }
  .file input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .errors { margin: 0; padding: 8px 10px 8px 26px; color: var(--bad); font-size: 12px; background: var(--bad-bg); border-radius: var(--r-sm); }
  .errors code { font-weight: 600; margin-right: 4px; }
  .msg { margin: 0; font-size: 12px; color: var(--fg-soft); display: flex; gap: 6px; align-items: flex-start; }
  .msg :global(.icon) { color: var(--good); margin-top: 2px; }
  .danger-zone { padding-top: 16px; border-top: 1px solid var(--border-soft); }
</style>
