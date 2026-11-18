<script lang="ts">
  import type { ConfigStore } from '../config/store.svelte';
  import { describeSource } from '../config/store.svelte';
  import { parseConfigText, serialiseConfig, MAX_CONFIG_BYTES, type ConfigError } from '../config/parse';
  import type { Config } from '../config/schema';
  import { encodeConfigHash } from '../share/url';
  import { loadRepoConfig, parseRepoRef, DEFAULT_REPO_PATH } from '../share/repo';
  import { scrubToken, type Client } from '../github/client';

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
  <p class="source">Active config: <strong>{describeSource(store.source)}</strong>{#if store.unsaved} (not saved){/if}</p>
  <label for="cfg">Config (YAML or JSON)</label>
  <textarea id="cfg" bind:value={text} spellcheck="false" rows="18"></textarea>
  {#if errors.length}
    <ul class="errors" role="alert">
      {#each errors as e, i (i)}<li><code>{e.path}</code>: {e.message}</li>{/each}
    </ul>
  {/if}
  <div class="row">
    <button onclick={apply}>Apply</button>
    <button onclick={reload}>Revert text</button>
    <button onclick={() => download('yaml')}>Download YAML</button>
    <button onclick={() => download('json')}>Download JSON</button>
    <label class="file">Import file<input type="file" accept=".yml,.yaml,.json,application/json,text/yaml" onchange={importFile} /></label>
    <button onclick={copyLink}>Copy share link</button>
  </div>
  <form class="row" onsubmit={loadRepo}>
    <input placeholder="owner/repo  (reads {DEFAULT_REPO_PATH})" bind:value={repo} spellcheck="false" />
    <button type="submit" disabled={busy || !repo.trim()}>{busy ? 'Loading…' : 'Load from repo'}</button>
  </form>
  <div class="row">
    <button class="danger" onclick={() => { if (confirm('Replace your config with the built-in default?')) { store.resetToDefault(); reload(); onApplied(); } }}>Reset to default</button>
  </div>
  {#if message}<p class="msg">{message}</p>{/if}
</div>

<style>
  .panel { display: grid; gap: 8px; }
  .source { margin: 0; font-size: 13px; }
  label { font-weight: 600; font-size: 13px; }
  textarea { width: 100%; font-family: var(--mono); font-size: 12px; box-sizing: border-box; resize: vertical; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .row input { flex: 1; min-width: 200px; }
  .file { font-weight: 400; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .file input { display: none; }
  .errors { margin: 0; padding-left: 18px; color: var(--bad); font-size: 13px; }
  .msg { margin: 0; font-size: 13px; color: var(--muted); }
  .danger { color: var(--bad); }
</style>
