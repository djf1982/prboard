<script lang="ts">
  import { ALL_FIELDS, ACTIONS_COLUMN_ID } from '../fields/registry';
  import type { ViewConfig } from '../config/schema';
  import { columnId } from '../config/parse';
  import Icon from './Icon.svelte';

  const LABELS = new Map<string, string>([...ALL_FIELDS.map((f) => [f.id, f.label] as [string, string]), [ACTIONS_COLUMN_ID, 'Actions']]);
  const labelOf = (c: ViewConfig['columns'][number]) => (typeof c !== 'string' && c.label) || LABELS.get(columnId(c)) || columnId(c);

  let { view, onViewChange }: { view: ViewConfig; onViewChange: (m: (v: ViewConfig) => void) => void } = $props();

  const entries = $derived(new Map(view.columns.map((c) => [columnId(c), c])));
  const isShown = (id: string) => { const e = entries.get(id); return !!e && (typeof e === 'string' || !e.hidden); };
  const computed = $derived(view.columns.filter((c) => typeof c !== 'string' && c.from));
  let filter = $state('');
  const list = $derived(
    [...ALL_FIELDS.map((f) => ({ id: f.id, label: f.label, description: f.description, cost: f.cost ?? 'low', requires: f.requires ?? [] })),
     { id: ACTIONS_COLUMN_ID, label: 'Actions', description: 'Buttons to enable auto-merge, mark ready, update the branch, use the merge queue or approve. Needs a token with write access.', cost: 'low', requires: ['Pull requests: write'] }]
      .filter((f) => !filter || (f.id + f.label + f.description).toLowerCase().includes(filter.toLowerCase())),
  );

  function toggle(id: string) {
    onViewChange((v) => {
      const i = v.columns.findIndex((c) => columnId(c) === id);
      if (i < 0) { v.columns.push(id); return; }
      const c = v.columns[i]!;
      if (typeof c !== 'string' && c.hidden) { v.columns[i] = { ...c, hidden: false }; return; }
      if (v.columns.length > 1) v.columns.splice(i, 1);
    });
  }

  function move(id: string, dir: -1 | 1) {
    onViewChange((v) => {
      const i = v.columns.findIndex((c) => columnId(c) === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= v.columns.length) return;
      [v.columns[i], v.columns[j]] = [v.columns[j]!, v.columns[i]!];
    });
  }
</script>

<div class="picker">
  <section>
    <h3>Shown in “{view.name}”</h3>
    <ol class="order">
      {#each view.columns as c, i (columnId(c))}
        {@const id = columnId(c)}
        {@const hidden = typeof c !== 'string' && !!c.hidden}
        <li class:hidden>
          <span class="name" title={id}>{labelOf(c)}{#if typeof c !== 'string' && c.from}<span class="tag">computed</span>{/if}{#if hidden}<span class="tag">hidden</span>{/if}</span>
          <span class="row-tools">
            <button class="ghost icon-only sm" title="Move left" aria-label="Move {labelOf(c)} left" disabled={i === 0} onclick={() => move(id, -1)}><Icon id="arrow-up" size={12} /></button>
            <button class="ghost icon-only sm" title="Move right" aria-label="Move {labelOf(c)} right" disabled={i === view.columns.length - 1} onclick={() => move(id, 1)}><Icon id="arrow-down" size={12} /></button>
            {#if hidden}
              <button class="ghost sm" onclick={() => toggle(id)}>Show</button>
            {:else}
              <button class="ghost icon-only sm" title="Remove" aria-label="Remove {labelOf(c)}" disabled={view.columns.length < 2} onclick={() => toggle(id)}><Icon id="close" size={12} /></button>
            {/if}
          </span>
        </li>
      {/each}
    </ol>
    {#if computed.length}<p class="hint">Edit computed columns in the Config panel.</p>{/if}
  </section>

  <section>
    <h3>All fields</h3>
    <div class="search"><Icon id="search" size={13} /><input type="search" placeholder="Filter fields…" bind:value={filter} aria-label="Filter fields" /></div>
    <ul class="all">
      {#each list as f (f.id)}
        <li>
          <label title={f.requires.length ? 'Needs: ' + f.requires.join(', ') : undefined}>
            <input type="checkbox" checked={isShown(f.id)} onchange={() => toggle(f.id)} />
            <span class="body">
              <span class="label">{f.label}
                {#if f.cost === 'high'}<span class="badge" title="Uses more API rate limit">high cost</span>{/if}
                <code>{f.id}</code>
              </span>
              <span class="desc">{f.description}</span>
            </span>
          </label>
        </li>
      {:else}
        <li class="none">No fields match “{filter}”.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .picker { display: grid; gap: 22px; }
  section { display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .order { margin: 0; padding: 4px; list-style: none; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-sunken); }
  .order li { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 4px 0 10px; border-radius: var(--r-sm); }
  .order li:hover { background: var(--hover); }
  .order li.hidden .name { color: var(--muted); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .tag { font-size: 10px; font-weight: 500; color: var(--muted); background: var(--chip-bg); border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
  .row-tools { display: inline-flex; gap: 1px; opacity: .35; transition: opacity .12s; }
  .order li:hover .row-tools, .order li:focus-within .row-tools { opacity: 1; }
  .sm { height: 24px; font-size: 12px; padding: 0 8px; }
  .sm.icon-only { width: 24px; padding: 0; }
  .search { position: relative; display: flex; align-items: center; color: var(--muted); }
  .search :global(.icon) { position: absolute; left: 10px; pointer-events: none; }
  .search input { width: 100%; padding-left: 30px; }
  .all { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .all label { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: var(--r-sm); cursor: pointer; }
  .all label:hover { background: var(--hover); }
  .all input { margin: 2px 0 0; }
  .body { display: grid; gap: 2px; min-width: 0; }
  .label { font-weight: 500; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  code { font-weight: 400; color: var(--muted); font-size: 11px; opacity: .7; }
  .desc { font-size: 12px; color: var(--muted); line-height: 1.45; }
  .badge { font-size: 10px; font-weight: 600; color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); border-radius: 4px; padding: 1px 5px; }
  .none { color: var(--muted); font-size: 12px; padding: 8px; }
</style>
