<script lang="ts">
  import type { ConfigStore } from '../config/store.svelte';
  import type { ViewConfig } from '../config/schema';
  import { ALL_FIELDS } from '../fields/registry';

  let { store, view, onSelect }: { store: ConfigStore; view: ViewConfig; onSelect: (name: string) => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(view.name);
  // svelte-ignore state_referenced_locally
  let query = $state(view.query);
  let error = $state<string | null>(null);

  function save(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !query.trim()) { error = 'Name and query are required.'; return; }
    if (n !== view.name && store.config.views.some((v) => v.name === n)) { error = `A view called "${n}" exists.`; return; }
    const old = view.name;
    store.updateView(old, (v) => { v.name = n; v.query = query.trim(); });
    error = null;
    onSelect(n);
  }

  function addView() {
    let n = 'New view';
    for (let i = 2; store.config.views.some((v) => v.name === n); i++) n = `New view ${i}`;
    store.update((c) => { c.views.push({ name: n, query: 'is:open is:pr involves:@me', sort: [{ field: 'updatedAt', dir: 'desc' }], columns: ['title', 'repository', 'autoMerge', 'checks', 'age'] }); });
    onSelect(n);
  }

  function removeView() {
    if (store.config.views.length < 2) { error = 'You need at least one view.'; return; }
    if (!confirm(`Delete the view "${view.name}"?`)) return;
    const name = view.name;
    store.update((c) => { c.views = c.views.filter((v) => v.name !== name); });
    onSelect(store.config.views[0]!.name);
  }

  function moveView(dir: -1 | 1) {
    const name = view.name;
    store.update((c) => {
      const i = c.views.findIndex((v) => v.name === name);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.views.length) return;
      [c.views[i], c.views[j]] = [c.views[j]!, c.views[i]!];
    });
  }
</script>

<form class="editor" onsubmit={save}>
  <label>Name <input bind:value={name} maxlength="60" /></label>
  <label>Search query
    <input bind:value={query} maxlength="1000" spellcheck="false" />
  </label>
  <p class="hint">Any GitHub search, for example <code>is:open author:@me org:acme</code>. <code>is:pr</code> is added if missing.</p>
  <label>Group by
    <select value={view.groupBy ?? ''} onchange={(e) => { const g = (e.currentTarget as HTMLSelectElement).value; store.updateView(view.name, (v) => { v.groupBy = g || undefined; }); }}>
      <option value="">No grouping</option>
      {#each ALL_FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
    </select>
  </label>
  <div class="row">
    <button type="submit">Save view</button>
    <button type="button" onclick={() => moveView(-1)}>Move left</button>
    <button type="button" onclick={() => moveView(1)}>Move right</button>
    <button type="button" onclick={addView}>Add view</button>
    <button type="button" class="danger" onclick={removeView}>Delete view</button>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
</form>

<style>
  .editor { display: grid; gap: 8px; }
  label { display: grid; gap: 3px; font-size: 13px; font-weight: 600; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .error { color: var(--bad); margin: 0; }
  .danger { color: var(--bad); }
</style>
