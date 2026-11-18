<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Auth } from '../auth/auth.svelte';
  import { ConfigStore, describeSource } from '../config/store.svelte';
  import { DataStore } from '../views/dataStore.svelte';
  import { configFragments, resolveView } from '../views/columns';
  import { decodeConfigHash, hasConfigHash } from '../share/url';
  import type { ViewConfig } from '../config/schema';
  import TokenScreen from './TokenScreen.svelte';
  import ViewTable from './ViewTable.svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import ViewEditor from './ViewEditor.svelte';
  import ConfigPanel from './ConfigPanel.svelte';

  const auth = new Auth();
  const store = new ConfigStore();
  const data = new DataStore(() => auth.client, () => store.config);

  let activeName = $state(store.config.views[0]?.name ?? '');
  let panel = $state<null | 'columns' | 'view' | 'config'>(null);
  let linkErrors = $state<string[]>([]);
  let writeDenied = $state<string | null>(null);

  // A config in the URL (#config=...) becomes active, but is not saved until the user keeps it.
  if (hasConfigHash(location.hash)) {
    const hash = location.hash;
    history.replaceState(null, '', location.pathname + location.search);
    void decodeConfigHash(hash).then((res) => {
      if (res.ok) { store.replace(res.config, { kind: 'url' }); activeName = res.config.views[0]!.name; }
      else linkErrors = res.errors.map((e) => `${e.path}: ${e.message}`);
    });
  }

  const view = $derived<ViewConfig>(store.config.views.find((v) => v.name === activeName) ?? store.config.views[0]!);
  const columns = $derived(resolveView(view));
  // Re-create the table only when the set of columns changes, not when one is hidden or resized.
  const tableKey = $derived(view.name + '|' + JSON.stringify(columns.map((c) => [c.id, c.kind, c.label])));
  const viewData = $derived(data.view(view.name));
  const fragmentsKey = $derived(JSON.stringify(configFragments(store.config)) + '|' + store.config.views.map((v) => v.query).join('\n'));

  // Start polling when signed in. Refetch when the fields or queries in use change.
  $effect(() => {
    if (auth.status !== 'signed-in') return;
    void fragmentsKey;
    data.start();
    return () => data.stop();
  });
  $effect(() => { void store.config.refreshSeconds; data.reschedule(); });
  onDestroy(() => data.stop());

  function onViewChange(mutate: (v: ViewConfig) => void) {
    store.updateView(view.name, mutate);
  }

  function fmtTime(ms: number | null) {
    return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  }
</script>

{#if auth.status !== 'signed-in'}
  <TokenScreen {auth} />
{:else}
  <div class="app">
    <header>
      <strong class="brand">prboard</strong>
      <nav class="tabs" aria-label="Views">
        {#each store.config.views as v (v.name)}
          {@const d = data.view(v.name)}
          <button class="tab" class:active={v.name === view.name} onclick={() => (activeName = v.name)}>
            {v.name}{#if d.fetchedAt}<span class="n">{d.rows.length}{d.truncated ? '+' : ''}</span>{/if}
          </button>
        {/each}
      </nav>
      <div class="spacer"></div>
      <button onclick={() => data.refresh()} disabled={data.loading} title="Refresh now">{data.loading ? 'Refreshing…' : '↻ Refresh'}</button>
      <button class:on={panel === 'columns'} onclick={() => (panel = panel === 'columns' ? null : 'columns')}>Columns</button>
      <button class:on={panel === 'view'} onclick={() => (panel = panel === 'view' ? null : 'view')}>View</button>
      <button class:on={panel === 'config'} onclick={() => (panel = panel === 'config' ? null : 'config')}>Config</button>
      <span class="who" title="Signed in to {auth.apiUrl}">@{auth.login}</span>
      <button onclick={() => { if (confirm('Sign out and remove the token and config from this browser?')) { data.stop(); auth.signOut(); } }}>Sign out</button>
    </header>

    {#if store.unsaved}
      <div class="banner info">
        Using the config from {describeSource(store.source)}. It is not saved in this browser.
        <button onclick={() => store.save()}>Keep this config</button>
      </div>
    {/if}
    {#each linkErrors as e, i (i)}<div class="banner bad">Shared link: {e}</div>{/each}
    {#if store.loadErrors.length}
      <div class="banner bad">The saved config is not valid, so the default is in use: {store.loadErrors.map((e) => `${e.path}: ${e.message}`).join('; ')}</div>
    {/if}
    {#if data.fatal}<div class="banner bad" role="alert">{data.fatal}</div>{/if}
    {#if writeDenied}<div class="banner warn">{writeDenied} <button onclick={() => (writeDenied = null)}>Dismiss</button></div>{/if}
    {#if viewData.error}<div class="banner bad">{viewData.error}</div>{/if}
    {#each viewData.errors as e, i (i)}<div class="banner warn">{e}</div>{/each}

    <div class="body" class:with-panel={panel}>
      <section class="main">
        <div class="meta">
          <code class="query">{view.query}</code>
          {#if viewData.fetchedAt}<span>{viewData.total.toLocaleString()} found</span>{/if}
        </div>
        {#if !viewData.fetchedAt && (data.loading || !data.lastUpdated) && !viewData.error}
          <p class="state">Loading pull requests…</p>
        {:else if viewData.fetchedAt && viewData.rows.length === 0}
          <p class="state">No pull requests match this query.</p>
        {:else if viewData.rows.length}
          {#key tableKey}
            <ViewTable
              {view}
              {columns}
              rows={viewData.rows}
              client={auth.client}
              {onViewChange}
              onActionDone={() => data.refresh()}
              onWriteDenied={(m) => (writeDenied = m)}
            />
          {/key}
        {/if}
      </section>
      {#if panel}
        <aside class="side">
          <button class="close" onclick={() => (panel = null)} aria-label="Close panel">×</button>
          {#if panel === 'columns'}
            <ColumnPicker {view} {onViewChange} />
          {:else if panel === 'view'}
            {#key view.name}<ViewEditor {store} {view} onSelect={(n) => (activeName = n)} />{/key}
            <label class="refresh">Refresh every
              <input type="number" min="30" max="3600" step="30" value={store.config.refreshSeconds}
                onchange={(e) => { const n = Math.min(3600, Math.max(30, Number((e.currentTarget as HTMLInputElement).value) || 120)); store.update((c) => { c.refreshSeconds = n; }); }} /> seconds
            </label>
          {:else}
            <ConfigPanel {store} client={auth.client} token={auth.token} onApplied={() => { activeName = store.config.views[0]!.name; }} />
          {/if}
        </aside>
      {/if}
    </div>

    <footer>
      <span>Updated {fmtTime(data.lastUpdated)}{#if data.paused} · paused while the tab is hidden{/if} · every {store.config.refreshSeconds}s</span>
      {#if data.rateLimit}
        <span title="GraphQL rate limit (points per hour)">
          API {data.rateLimit.remaining.toLocaleString()}/{data.rateLimit.limit.toLocaleString()} · last cost {viewData.cost || data.rateLimit.cost} · resets {new Date(data.rateLimit.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      {/if}
      <span>Config: {describeSource(store.source)}</span>
    </footer>
  </div>
{/if}

<style>
  .app { display: flex; flex-direction: column; min-height: 100vh; }
  header { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg-raised); flex-wrap: wrap; }
  .brand { margin-right: 10px; }
  .tabs { display: flex; gap: 2px; flex-wrap: wrap; }
  .tab { border: 0; background: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font: inherit; color: var(--muted); }
  .tab.active { background: var(--hover); color: var(--fg); font-weight: 600; }
  .n { margin-left: 6px; font-size: 11px; border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; }
  .spacer { flex: 1; }
  .who { color: var(--muted); font-size: 13px; }
  button.on { border-color: var(--accent); color: var(--accent); }
  .banner { padding: 6px 14px; font-size: 13px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .banner.info { background: var(--info-bg); }
  .banner.warn { background: var(--warn-bg); }
  .banner.bad { background: var(--bad-bg); }
  .body { flex: 1; display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px 14px; min-height: 0; }
  .body.with-panel { grid-template-columns: minmax(0, 1fr) 360px; }
  .main { min-width: 0; }
  .meta { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 13px; color: var(--muted); }
  .query { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { color: var(--muted); padding: 24px; text-align: center; border: 1px dashed var(--border); border-radius: 8px; }
  .side { position: relative; border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: var(--bg-raised); align-self: start; max-height: calc(100vh - 140px); overflow: auto; }
  .close { position: absolute; right: 6px; top: 6px; border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--muted); }
  .refresh { display: block; margin-top: 16px; font-size: 13px; }
  .refresh input { width: 80px; }
  footer { display: flex; gap: 16px; flex-wrap: wrap; padding: 6px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--border); }
  @media (max-width: 900px) { .body.with-panel { grid-template-columns: 1fr; } }
</style>
