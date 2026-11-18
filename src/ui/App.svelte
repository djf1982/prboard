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
  import { installUrl } from '../auth/oauth';

  const appInstallUrl = installUrl();

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
      <span class="brand"><span class="logo" aria-hidden="true"></span>prboard</span>
      <nav class="tabs" aria-label="Views">
        {#each store.config.views as v (v.name)}
          {@const d = data.view(v.name)}
          <button class="tab" class:active={v.name === view.name} onclick={() => (activeName = v.name)}>
            {v.name}{#if d.fetchedAt}<span class="n">{d.rows.length}{d.truncated ? '+' : ''}</span>{/if}
          </button>
        {/each}
      </nav>
      <div class="spacer"></div>
      <button class="ghost" onclick={() => data.refresh()} disabled={data.loading} title="Refresh now">
        <span class="spin" class:spinning={data.loading}>↻</span> {data.loading ? 'Refreshing' : 'Refresh'}
      </button>
      <div class="seg" role="group" aria-label="Panels">
        <button class:on={panel === 'columns'} onclick={() => (panel = panel === 'columns' ? null : 'columns')}>Columns</button>
        <button class:on={panel === 'view'} onclick={() => (panel = panel === 'view' ? null : 'view')}>View</button>
        <button class:on={panel === 'config'} onclick={() => (panel = panel === 'config' ? null : 'config')}>Config</button>
      </div>
      {#if auth.kind === 'app' && appInstallUrl}
        <a class="install" href={appInstallUrl} target="_blank" rel="noopener noreferrer" title="The app sees only repositories where it is installed">Install on an org</a>
      {/if}
      <span class="who" title="Signed in to {auth.apiUrl}{auth.kind === 'app' ? ' with the prboard GitHub App' : ' with a personal access token'}">
        <span class="avatar" aria-hidden="true">{(auth.login ?? '?').slice(0, 1).toUpperCase()}</span>{auth.login}
      </span>
      <button class="ghost" onclick={() => { if (confirm('Sign out and remove the token and config from this browser?')) { data.stop(); auth.signOut(); } }}>Sign out</button>
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
          <span class="label">Query</span>
          <code class="query" title={view.query}>{view.query}</code>
          {#if viewData.fetchedAt}<span class="found">{viewData.total.toLocaleString()} {viewData.total === 1 ? 'result' : 'results'}</span>{/if}
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
  header { display: flex; align-items: center; gap: 8px; padding: 0 16px; height: 52px; border-bottom: 1px solid var(--border); background: var(--bg-raised); flex-wrap: wrap; position: sticky; top: 0; z-index: 10; }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -.01em; margin-right: 12px; }
  .logo { width: 18px; height: 18px; border-radius: 5px; background: linear-gradient(135deg, var(--accent), var(--good)); }
  .tabs { display: flex; gap: 4px; align-self: stretch; }
  .tab { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; color: var(--muted); font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab:hover { color: var(--fg); }
  .tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; border-radius: 4px; }
  .tab.active { color: var(--fg); font-weight: 600; border-bottom-color: var(--accent); }
  .n { font-size: 11px; font-weight: 500; background: var(--chip-bg); color: var(--muted); border-radius: 999px; padding: 1px 7px; }
  .tab.active .n { color: var(--fg); }
  .spacer { flex: 1; }
  .ghost { background: transparent; border-color: transparent; color: var(--fg-soft); }
  .ghost:hover:not(:disabled) { background: var(--hover); color: var(--fg); }
  .spin { display: inline-block; }
  .spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; background: transparent; padding: 4px 12px; color: var(--fg-soft); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--hover); color: var(--fg); }
  .seg button.on { background: var(--accent-soft); color: var(--accent); }
  .install { font-size: 13px; padding: 0 6px; }
  .who { display: inline-flex; align-items: center; gap: 6px; color: var(--fg-soft); font-size: 13px; padding: 0 4px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--accent-soft); color: var(--accent); }
  .banner { padding: 8px 16px; font-size: 13px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .banner.info { background: var(--info-bg); }
  .banner.warn { background: var(--warn-bg); }
  .banner.bad { background: var(--bad-bg); }
  .body { flex: 1; display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px; min-height: 0; max-width: 1600px; width: 100%; margin: 0 auto; box-sizing: border-box; }
  .body.with-panel { grid-template-columns: minmax(0, 1fr) 360px; }
  .main { min-width: 0; }
  .meta { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; color: var(--muted); min-width: 0; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .query { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 12px; background: var(--chip-bg); color: var(--fg-soft); padding: 2px 8px; border-radius: 6px; min-width: 0; }
  .found { flex: none; }
  .state { color: var(--muted); padding: 48px 24px; text-align: center; border: 1px dashed var(--border); border-radius: 10px; }
  .side { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 16px; background: var(--bg-raised); align-self: start; max-height: calc(100vh - 140px); overflow: auto; box-shadow: var(--card-shadow); }
  .close { position: absolute; right: 8px; top: 8px; border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--muted); }
  .refresh { display: block; margin-top: 16px; font-size: 13px; }
  .refresh input { width: 80px; }
  footer { display: flex; gap: 20px; flex-wrap: wrap; padding: 8px 16px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--border); font-variant-numeric: tabular-nums; }
  @media (max-width: 900px) { .body.with-panel { grid-template-columns: 1fr; } }
</style>
