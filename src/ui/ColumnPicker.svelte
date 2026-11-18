<script lang="ts">
  import { ALL_FIELDS, ACTIONS_COLUMN_ID } from '../fields/registry';
  import type { ViewConfig } from '../config/schema';
  import { columnId } from '../config/parse';

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
  <h3>Columns in "{view.name}"</h3>
  <ol class="order">
    {#each view.columns as c (columnId(c))}
      {@const id = columnId(c)}
      <li class:hidden={typeof c !== 'string' && c.hidden}>
        <span class="name">{id}{#if typeof c !== 'string' && c.hidden} (hidden){/if}</span>
        <button title="Move left" onclick={() => move(id, -1)}>↑</button>
        <button title="Move right" onclick={() => move(id, 1)}>↓</button>
        <button title={typeof c !== 'string' && c.hidden ? 'Show' : 'Remove'} onclick={() => toggle(id)}>{typeof c !== 'string' && c.hidden ? 'show' : '×'}</button>
      </li>
    {/each}
  </ol>
  {#if computed.length}<p class="hint">Edit computed columns in the config (YAML) panel.</p>{/if}

  <input type="search" placeholder="Filter fields…" bind:value={filter} />
  <ul class="all">
    {#each list as f (f.id)}
      <li>
        <label>
          <input type="checkbox" checked={isShown(f.id)} onchange={() => toggle(f.id)} />
          <span class="label">{f.label} <code>{f.id}</code>
            {#if f.cost === 'high'}<span class="badge warn" title="Uses more API rate limit">high cost</span>{/if}</span>
        </label>
        <p class="desc">{f.description}</p>
        {#if f.requires.length}<p class="req">Needs: {f.requires.join(', ')}</p>{/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .picker { display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 14px; }
  .order { margin: 0; padding-left: 20px; font-size: 13px; }
  .order li { display: flex; gap: 4px; align-items: center; }
  .order li.hidden .name { color: var(--muted); }
  .order .name { flex: 1; }
  .order button { padding: 0 6px; font-size: 12px; }
  .all { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 50vh; overflow: auto; }
  .all label { display: flex; gap: 6px; align-items: flex-start; font-weight: 600; font-size: 13px; }
  code { font-weight: 400; color: var(--muted); font-size: 12px; }
  .desc, .req { margin: 0 0 0 22px; font-size: 12px; color: var(--muted); }
  .badge { font-size: 11px; border-radius: 4px; padding: 0 4px; margin-left: 4px; font-weight: 500; }
  .badge.warn { color: var(--warn); border: 1px solid currentColor; }
  .hint { font-size: 12px; color: var(--muted); margin: 0; }
</style>
