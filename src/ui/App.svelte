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
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { placeNear } from './popover';

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

  // The toolbar query is editable in place. Enter saves it to the view; Esc or leaving the box cancels.
  let queryDraft = $state('');
  let queryInput: HTMLInputElement | undefined = $state();
  $effect(() => { queryDraft = view.query; });
  const queryDirty = $derived(queryDraft.trim() !== view.query && queryDraft.trim() !== '');
  function applyQuery() {
    const q = queryDraft.trim();
    if (!q) { queryDraft = view.query; return; }
    if (q !== view.query) onViewChange((v) => { v.query = q; });
    queryInput?.blur();
  }

  function onViewChange(mutate: (v: ViewConfig) => void) {
    store.updateView(view.name, mutate);
  }

  function fmtTime(ms: number | null) {
    return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  }

  // A clock for the "Updated 2m ago" label. It ticks slowly; the exact time is in the tooltip.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(t);
  });
  function ago(ms: number | null): string {
    if (!ms) return 'Not updated yet';
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 45) return 'Updated just now';
    const m = Math.round(s / 60);
    if (m < 60) return `Updated ${m}m ago`;
    return `Updated ${Math.round(m / 60)}h ago`;
  }

  const PANEL_TITLES = { columns: 'Columns', view: 'View settings', config: 'Config' } as const;
  function togglePanel(p: 'columns' | 'view' | 'config') { panel = panel === p ? null : p; }

  // Keyboard: r refreshes, 1–9 picks a view, Esc closes the side panel.
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || auth.status !== 'signed-in') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'Escape' && panel) { panel = null; return; }
    if (e.key === 'r' && !data.loading) { e.preventDefault(); void data.refresh(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && store.config.views[n - 1]) { e.preventDefault(); activeName = store.config.views[n - 1]!.name; }
  }

  // The account menu lives in the top layer (Popover API).
  let userBtn: HTMLButtonElement | undefined = $state();
  let userMenu: HTMLDivElement | undefined = $state();
  let menuPos = $state({ top: 0, left: 0 });
  function placeUserMenu(e: Event) {
    if ((e as ToggleEvent).newState !== 'open' || !userBtn || !userMenu) return;
    menuPos = placeNear(userBtn, userMenu, 'end');
  }
  function signOut() {
    userMenu?.hidePopover?.();
    if (confirm('Sign out and remove the token and config from this browser?')) { data.stop(); auth.signOut(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if auth.status !== 'signed-in'}
  <TokenScreen {auth} />
{:else}
  <div class="app">
    <div class="progress" class:on={data.loading} aria-hidden="true"></div>
    <header class="topbar">
      <span class="brand"><Logo size={15} /></span>
      <nav class="tabs" aria-label="Views">
        {#each store.config.views as v, i (v.name)}
          {@const d = data.view(v.name)}
          <button class="tab" class:active={v.name === view.name} aria-current={v.name === view.name ? 'page' : undefined}
            title={i < 9 ? `${v.name} (press ${i + 1})` : v.name} onclick={() => (activeName = v.name)}>
            <span class="tab-name">{v.name}</span>
            {#if d.fetchedAt}<span class="n">{d.rows.length}{d.truncated ? '+' : ''}</span>{/if}
          </button>
        {/each}
      </nav>
      <div class="spacer"></div>
      <span class="updated" title="Last updated {fmtTime(data.lastUpdated)}. Refreshes every {store.config.refreshSeconds}s{data.paused ? '; paused while the tab is hidden' : ''}.">
        {#if data.paused}<span class="paused-dot" aria-hidden="true"></span>Paused{:else}{data.loading ? 'Refreshing…' : ago(data.lastUpdated)}{/if}
      </span>
      <button class="ghost icon-only" onclick={() => data.refresh()} disabled={data.loading} title="Refresh now (R)" aria-label="Refresh now">
        <span class="spin" class:spinning={data.loading}><Icon id="refresh" /></span>
      </button>
      <button class="ghost icon-only" class:on={panel === 'config'} onclick={() => togglePanel('config')} aria-pressed={panel === 'config'} aria-label="Config" title="Config: import, export and share">
        <Icon id="code" />
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button class="ghost user" bind:this={userBtn} popovertarget="user-menu" aria-haspopup="menu">
        <span class="avatar" aria-hidden="true">{(auth.login ?? '?').slice(0, 1).toUpperCase()}</span>
        <span class="login">{auth.login}</span>
        <Icon id="chevron-down" size={12} />
      </button>
      <div class="menu" id="user-menu" popover="auto" bind:this={userMenu} ontoggle={placeUserMenu} style:top="{menuPos.top}px" style:left="{menuPos.left}px">
        <div class="menu-head">
          <span class="avatar lg" aria-hidden="true">{(auth.login ?? '?').slice(0, 1).toUpperCase()}</span>
          <div>
            <div class="menu-login">{auth.login}</div>
            <div class="menu-sub">{auth.kind === 'app' ? 'GitHub App sign-in' : 'Personal access token'} · {new URL(auth.apiUrl).host}</div>
          </div>
        </div>
        {#if auth.kind === 'app' && appInstallUrl}
          <a class="menu-item" href={appInstallUrl} target="_blank" rel="noopener noreferrer" title="The app sees only repositories where it is installed">
            <Icon id="plus" /> Install on an organisation <span class="ext"><Icon id="external" size={12} /></span>
          </a>
        {/if}
        <button class="menu-item danger-item" onclick={signOut}><Icon id="logout" /> Sign out</button>
      </div>
    </header>

    <div class="banners">
      {#if store.unsaved}
        <div class="banner info"><Icon id="info" />
          <span class="banner-text">Using the config from {describeSource(store.source)}. It is not saved in this browser.</span>
          <button class="primary" onclick={() => store.save()}>Keep this config</button>
        </div>
      {/if}
      {#each linkErrors as e, i (i)}<div class="banner bad"><Icon id="alert" /><span class="banner-text">Shared link: {e}</span></div>{/each}
      {#if store.loadErrors.length}
        <div class="banner bad"><Icon id="alert" /><span class="banner-text">The saved config is not valid, so the default is in use: {store.loadErrors.map((e) => `${e.path}: ${e.message}`).join('; ')}</span></div>
      {/if}
      {#if data.fatal}<div class="banner bad" role="alert"><Icon id="alert" /><span class="banner-text">{data.fatal}</span></div>{/if}
      {#if writeDenied}<div class="banner warn"><Icon id="lock" /><span class="banner-text">{writeDenied}</span><button class="ghost" onclick={() => (writeDenied = null)}>Dismiss</button></div>{/if}
      {#if viewData.error}<div class="banner bad"><Icon id="alert" /><span class="banner-text">{viewData.error}</span></div>{/if}
      {#each viewData.errors as e, i (i)}<div class="banner warn"><Icon id="alert" /><span class="banner-text">{e}</span></div>{/each}
    </div>

    <div class="body" class:with-panel={panel}>
      <section class="main">
        <div class="toolbar">
          <form class="query" class:dirty={queryDirty} onsubmit={(e) => { e.preventDefault(); applyQuery(); }}>
            <Icon id="search" size={13} />
            <input
              bind:this={queryInput}
              bind:value={queryDraft}
              aria-label="Search query"
              title={queryDirty ? 'Press Enter to search, or Esc to cancel' : view.query}
              maxlength="1000" spellcheck="false" autocomplete="off"
              onkeydown={(e) => { if (e.key === 'Escape') { queryDraft = view.query; queryInput?.blur(); } }}
              onblur={() => { if (queryDirty) queryDraft = view.query; }}
            />
            {#if queryDirty}<kbd title="Press Enter to search">↵</kbd>{/if}
          </form>
          {#if viewData.fetchedAt}<span class="found">{viewData.total.toLocaleString()} {viewData.total === 1 ? 'result' : 'results'}</span>{/if}
          <div class="spacer"></div>
          <div class="icon-group" role="group" aria-label="View tools">
            <button class="ghost icon-only" class:on={panel === 'columns'} aria-pressed={panel === 'columns'} aria-label="Columns" title="Columns" onclick={() => togglePanel('columns')}><Icon id="columns" /></button>
            <button class="ghost icon-only" class:on={panel === 'view'} aria-pressed={panel === 'view'} aria-label="View settings" title="View settings: name, query, grouping" onclick={() => togglePanel('view')}><Icon id="sliders" /></button>
          </div>
        </div>
        {#if !viewData.fetchedAt && (data.loading || !data.lastUpdated) && !viewData.error}
          <div class="skeleton" aria-label="Loading pull requests" role="status">
            {#each [0, 1, 2, 3, 4] as i (i)}
              <div class="sk-row" style:--d="{i * 80}ms"><span class="sk w1"></span><span class="sk w2"></span><span class="sk w3"></span><span class="sk w4"></span></div>
            {/each}
          </div>
        {:else if viewData.fetchedAt && viewData.rows.length === 0}
          <div class="empty">
            <span class="empty-icon"><Icon id="inbox" size={22} /></span>
            <p class="empty-title">All clear</p>
            <p class="empty-sub">No pull requests match this query.</p>
          </div>
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
        <aside class="side" aria-label={PANEL_TITLES[panel]}>
          <div class="side-head">
            <h2>{PANEL_TITLES[panel]}</h2>
            <button class="ghost icon-only" onclick={() => (panel = null)} aria-label="Close panel" title="Close (Esc)"><Icon id="close" /></button>
          </div>
          <div class="side-body">
            {#if panel === 'columns'}
              <ColumnPicker {view} {onViewChange} />
            {:else if panel === 'view'}
              {#key view.name}<ViewEditor {store} {view} onSelect={(n) => (activeName = n)} />{/key}
              <div class="refresh">
                <label class="field-label" for="refresh-secs">Refresh interval</label>
                <div class="refresh-row">
                  <input id="refresh-secs" type="number" min="30" max="3600" step="30" value={store.config.refreshSeconds}
                    onchange={(e) => { const n = Math.min(3600, Math.max(30, Number((e.currentTarget as HTMLInputElement).value) || 120)); store.update((c) => { c.refreshSeconds = n; }); }} />
                  <span class="hint">seconds, for all views</span>
                </div>
              </div>
            {:else}
              <ConfigPanel {store} client={auth.client} token={auth.token} onApplied={() => { activeName = store.config.views[0]!.name; }} />
            {/if}
          </div>
        </aside>
      {/if}
    </div>

    <footer>
      <span>Every {store.config.refreshSeconds}s{#if data.paused} · paused while the tab is hidden{/if}</span>
      {#if data.rateLimit}
        {@const pct = data.rateLimit.remaining / data.rateLimit.limit}
        <span class="rate" title="GraphQL rate limit (points per hour). Last query cost {viewData.cost || data.rateLimit.cost}.">
          <span class="meter" aria-hidden="true"><span class="meter-fill" class:low={pct < 0.2} style:width="{Math.round(pct * 100)}%"></span></span>
          API {data.rateLimit.remaining.toLocaleString()}/{data.rateLimit.limit.toLocaleString()} · resets {new Date(data.rateLimit.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      {/if}
      <span>Config: {describeSource(store.source)}</span>
      <span class="spacer"></span>
      <span class="keys"><kbd>R</kbd> refresh <kbd>1</kbd>–<kbd>9</kbd> views</span>
    </footer>
  </div>
{/if}

<style>
  .app { display: flex; flex-direction: column; min-height: 100vh; }
  .spacer { flex: 1; }

  /* A thin bar at the very top shows that a refresh is running. */
  .progress { position: fixed; top: 0; left: 0; right: 0; height: 2px; z-index: 20; pointer-events: none; opacity: 0; transition: opacity .3s;
    background: linear-gradient(90deg, transparent, var(--accent), transparent); background-size: 40% 100%; background-repeat: no-repeat; }
  .progress.on { opacity: 1; animation: slide 1.1s var(--ease) infinite; }
  @keyframes slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }

  .topbar { display: flex; align-items: center; gap: 6px; padding: 0 16px; height: 52px; position: sticky; top: 0; z-index: 10;
    background: color-mix(in srgb, var(--bg-raised) 85%, transparent); backdrop-filter: saturate(1.4) blur(10px);
    border-bottom: 1px solid var(--border); }
  .brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 600; font-size: 14px; letter-spacing: -.015em; margin-right: 14px; }

  .tabs { display: flex; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .tab { height: 30px; padding: 0 10px; border: 0; background: transparent; color: var(--muted); font-weight: 500; border-radius: var(--r-sm); }
  .tab:hover:not(:disabled) { color: var(--fg); background: var(--hover); border: 0; }
  .tab.active { color: var(--fg); background: var(--hover); }
  .tab-name { overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .n { font-size: 11px; font-weight: 600; min-width: 18px; height: 18px; padding: 0 5px; display: inline-grid; place-items: center;
    border-radius: 999px; background: var(--chip-bg); color: var(--muted); font-variant-numeric: tabular-nums; }
  .tab.active .n { background: var(--accent-soft); color: var(--accent); }

  .updated { font-size: 12px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px; }
  .paused-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
  .spin { display: inline-flex; }
  .spinning { animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  button.on { background: var(--accent-soft); color: var(--accent); }
  button.on:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
  .divider { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
  .user { padding: 0 6px 0 4px; gap: 8px; }
  .login { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; line-height: 1;
    background: var(--chip-bg); box-shadow: inset 0 0 0 1px var(--border); color: var(--fg-soft); }
  .avatar.lg { width: 32px; height: 32px; font-size: 14px; }

  .menu { position: fixed; inset: auto; margin: 0; padding: 4px; min-width: 240px; background: var(--bg-raised); color: var(--fg);
    border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow); }
  .menu:popover-open { animation: pop .14s var(--ease); }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
  .menu-head { display: flex; gap: 10px; align-items: center; padding: 8px 8px 10px; border-bottom: 1px solid var(--border-soft); margin-bottom: 4px; }
  .menu-login { font-weight: 600; }
  .menu-sub { font-size: 12px; color: var(--muted); }
  .menu-item { display: flex; width: 100%; justify-content: flex-start; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border: 0;
    border-radius: var(--r-sm); background: none; color: var(--fg-soft); font-weight: 400; font-size: 13px; }
  .menu-item:hover:not(:disabled) { background: var(--hover); color: var(--fg); text-decoration: none; border: 0; }
  .ext { margin-left: auto; color: var(--muted); display: inline-flex; }
  .danger-item:hover:not(:disabled) { color: var(--bad); }

  .banners { display: grid; gap: 8px; padding: 12px 16px 0; max-width: 1600px; width: 100%; margin: 0 auto; }
  .banners:empty { display: none; }
  .banner { display: flex; gap: 10px; align-items: center; padding: 8px 8px 8px 12px; font-size: 13px; border-radius: var(--r-md); border: 1px solid; }
  .banner-text { flex: 1; min-width: 0; }
  .banner.info { background: var(--info-bg); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
  .banner.info > :global(.icon) { color: var(--accent); }
  .banner.warn { background: var(--warn-bg); border-color: color-mix(in srgb, var(--warn) 25%, transparent); }
  .banner.warn > :global(.icon) { color: var(--warn); }
  .banner.bad { background: var(--bad-bg); border-color: color-mix(in srgb, var(--bad) 25%, transparent); }
  .banner.bad > :global(.icon) { color: var(--bad); }

  .body { flex: 1; display: grid; grid-template-columns: 1fr; gap: 16px; padding: 14px 16px 24px; min-height: 0; max-width: 1600px; width: 100%; margin: 0 auto; }
  .body.with-panel { grid-template-columns: minmax(0, 1fr) 380px; }
  .main { min-width: 0; }

  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; min-width: 0; }
  .query { display: inline-flex; align-items: center; gap: 8px; min-width: 0; height: 28px; padding: 0 10px; border-radius: var(--r-sm);
    background: var(--bg-raised); border: 1px solid var(--border); color: var(--muted); }
  .query { width: min(100%, 560px); flex: 0 1 auto; transition: border-color .12s, box-shadow .12s; }
  .query:hover { border-color: var(--border-strong); }
  .query:focus-within { border-color: var(--accent); box-shadow: var(--ring); }
  .query input { all: unset; flex: 1; min-width: 0; font-family: var(--mono); font-size: 12px; color: var(--fg-soft); text-overflow: ellipsis; }
  .query input:focus { color: var(--fg); }
  .query kbd { flex: none; font: 11px/1 var(--font); color: var(--muted); padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-sunken); }
  .icon-group { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-raised); }
  .icon-group button { height: 24px; width: 26px; }
  .found { flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

  .skeleton { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-raised); overflow: hidden; }
  .sk-row { display: flex; gap: 24px; align-items: center; height: 44px; padding: 0 16px; border-bottom: 1px solid var(--border-soft); }
  .sk-row:last-child { border-bottom: 0; }
  .sk { height: 10px; border-radius: 5px; background: var(--hover); animation: pulse 1.4s ease-in-out infinite; animation-delay: var(--d); }
  .w1 { flex: 0 0 38%; } .w2 { flex: 0 0 10%; } .w3 { flex: 0 0 14%; } .w4 { flex: 0 0 8%; }
  @keyframes pulse { 50% { opacity: .45; } }

  .empty { display: grid; justify-items: center; gap: 4px; padding: 64px 24px; text-align: center; border: 1px dashed var(--border-strong); border-radius: var(--r-lg); }
  .empty-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--bg-raised); border: 1px solid var(--border); color: var(--muted); margin-bottom: 8px; }
  .empty-title { margin: 0; font-weight: 600; font-size: 14px; }
  .empty-sub { margin: 0; color: var(--muted); }

  .side { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-raised); align-self: start; position: sticky; top: 66px;
    max-height: calc(100vh - 92px); display: flex; flex-direction: column; box-shadow: var(--card-shadow); animation: enter .18s var(--ease); }
  @keyframes enter { from { opacity: 0; transform: translateX(8px); } }
  .side-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--border-soft); }
  .side-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .side-body { padding: 16px; overflow: auto; }
  .refresh { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
  .refresh-row { display: flex; align-items: center; gap: 10px; }
  .refresh input { width: 90px; }

  footer { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; padding: 8px 16px; font-size: 12px; color: var(--muted);
    border-top: 1px solid var(--border-soft); font-variant-numeric: tabular-nums; }
  .rate { display: inline-flex; align-items: center; gap: 8px; }
  .meter { width: 36px; height: 4px; border-radius: 2px; background: var(--hover); overflow: hidden; }
  .meter-fill { display: block; height: 100%; background: var(--good); border-radius: 2px; }
  .meter-fill.low { background: var(--warn); }
  .keys { display: inline-flex; gap: 4px; align-items: center; }
  kbd { font-family: var(--mono); font-size: 10px; min-width: 16px; height: 16px; padding: 0 4px; display: inline-grid; place-items: center;
    border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; color: var(--fg-soft); background: var(--bg-raised); }
  @media (max-width: 900px) {
    .body.with-panel { grid-template-columns: 1fr; }
    .side { position: static; max-height: none; }
    .keys, .updated, .login { display: none; }
  }
</style>
