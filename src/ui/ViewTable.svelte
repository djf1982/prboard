<script lang="ts">
  import {
    createTable,
    tableFeatures,
    rowSortingFeature,
    createSortedRowModel,
    columnGroupingFeature,
    createGroupedRowModel,
    rowExpandingFeature,
    createExpandedRowModel,
    columnVisibilityFeature,
    columnOrderingFeature,
    columnSizingFeature,
    columnResizingFeature,
    type ExpandedState,
    type SortingState,
    type Updater,
  } from '@tanstack/svelte-table';
  import type { ViewConfig, ColumnEntry } from '../config/schema';
  import { cellFor, groupValueOf, sortValueOf, type ResolvedColumn, type Row } from '../views/columns';
  import CellView from './CellView.svelte';
  import ActionsCell from './ActionsCell.svelte';
  import type { Client } from '../github/client';

  let {
    view,
    columns,
    rows,
    client,
    onViewChange,
    onActionDone,
    onWriteDenied,
  }: {
    view: ViewConfig;
    columns: ResolvedColumn[];
    rows: Row[];
    client: Client | null;
    onViewChange: (mutate: (v: ViewConfig) => void) => void;
    onActionDone: () => void;
    onWriteDenied: (message: string) => void;
  } = $props();

  // Register only the features this table uses (TanStack Table v9).
  const features = tableFeatures({
    columnVisibilityFeature,
    columnOrderingFeature,
    columnSizingFeature,
    columnResizingFeature,
    columnGroupingFeature,
    groupedRowModel: createGroupedRowModel(),
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    rowExpandingFeature,
    expandedRowModel: createExpandedRowModel(),
  });

  const colById = $derived(new Map(columns.map((c) => [c.id, c])));

  function compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  // The parent re-creates this component (with {#key}) when the set of columns changes,
  // so the column definitions can stay stable, as TanStack expects.
  // svelte-ignore state_referenced_locally
  const initialColumns = columns;
  const columnDefs = initialColumns.map((c) => ({
    id: c.id,
    header: c.label,
    accessorFn: (row: Row) => sortValueOf(c, row),
    getGroupingValue: (row: Row) => groupValueOf(c, row),
    sortFn: (ra: { getValue: (id: string) => unknown }, rb: { getValue: (id: string) => unknown }, id: string) => compare(ra.getValue(id), rb.getValue(id)),
    sortUndefined: 'last' as const,
    enableSorting: c.kind !== 'actions',
    enableGrouping: c.kind !== 'actions',
    enableResizing: true,
    size: c.width,
    minSize: 50,
    maxSize: 2000,
  }));

  // State slices are read from the config, and every change is written back to it.
  const sorting = $derived<SortingState>(view.sort.map((s) => ({ id: s.field, desc: s.dir === 'desc' })));
  const grouping = $derived(view.groupBy ? [view.groupBy] : []);
  const columnVisibility = $derived(Object.fromEntries(columns.map((c) => [c.id, !c.hidden])));
  const columnOrder = $derived(columns.map((c) => c.id));
  const columnSizing = $derived(Object.fromEntries(columns.map((c) => [c.id, c.width])));
  let expanded = $state<ExpandedState>(true);

  const resolve = <T,>(u: Updater<T>, prev: T): T => (typeof u === 'function' ? (u as (p: T) => T)(prev) : u);

  function setEntry(v: ViewConfig, id: string, patch: { hidden?: boolean; width?: number }) {
    const i = v.columns.findIndex((c) => (typeof c === 'string' ? c : c.id) === id);
    if (i < 0) return;
    const cur = v.columns[i]!;
    const obj = typeof cur === 'string' ? { id: cur } : { ...cur };
    v.columns[i] = { ...obj, ...patch } as ColumnEntry;
  }

  const table = createTable({
    features,
    columns: columnDefs,
    get data() {
      return rows;
    },
    getRowId: (row: Row) => row.pr.id,
    columnResizeMode: 'onEnd',
    enableMultiSort: true,
    groupedColumnMode: false,
    autoResetExpanded: false,
    state: {
      get sorting() { return sorting; },
      get grouping() { return grouping; },
      get columnVisibility() { return columnVisibility; },
      get columnOrder() { return columnOrder; },
      get columnSizing() { return columnSizing; },
      get expanded() { return expanded; },
    },
    onSortingChange: (u: Updater<SortingState>) => {
      const next = resolve(u, sorting);
      onViewChange((v) => { v.sort = next.slice(0, 5).map((s) => ({ field: s.id, dir: s.desc ? 'desc' : 'asc' })); });
    },
    onGroupingChange: (u: Updater<string[]>) => {
      const next = resolve(u, grouping);
      onViewChange((v) => { v.groupBy = next[next.length - 1]; });
    },
    onColumnVisibilityChange: (u: Updater<Record<string, boolean>>) => {
      const next = resolve(u, columnVisibility);
      onViewChange((v) => { for (const c of columns) if (!c.aux && next[c.id] !== undefined && next[c.id] === c.hidden) setEntry(v, c.id, { hidden: !next[c.id] }); });
    },
    onColumnSizingChange: (u: Updater<Record<string, number>>) => {
      const next = resolve(u, columnSizing);
      onViewChange((v) => { for (const c of columns) if (!c.aux && next[c.id] && next[c.id] !== c.width) setEntry(v, c.id, { width: Math.round(next[c.id]!) }); });
    },
    onExpandedChange: (u: Updater<ExpandedState>) => { expanded = resolve(u, expanded); },
  });

  let dragId = $state<string | null>(null);
  function drop(targetId: string) {
    const from = dragId;
    dragId = null;
    if (!from || from === targetId) return;
    onViewChange((v) => {
      const ids = v.columns.map((c) => (typeof c === 'string' ? c : c.id));
      const fi = ids.indexOf(from);
      const ti = ids.indexOf(targetId);
      if (fi < 0 || ti < 0) return;
      const [moved] = v.columns.splice(fi, 1);
      v.columns.splice(ti, 0, moved!);
    });
  }

  function hide(id: string) {
    onViewChange((v) => setEntry(v, id, { hidden: true }));
  }

  function toggleGroup(id: string) {
    onViewChange((v) => { v.groupBy = v.groupBy === id ? undefined : id; });
  }

  const visibleCount = $derived(columns.filter((c) => !c.hidden).length);
  const permissionHint = (req: string[]) => `Your token cannot read this. It needs: ${req.join(', ')}.`;
</script>

<div class="wrap">
  <table class="grid" style:width="{table.getTotalSize()}px">
    <thead>
      {#each table.getHeaderGroups() as group (group.id)}
        <tr>
          {#each group.headers as header (header.id)}
            {@const col = colById.get(header.column.id)}
            {@const sorted = header.column.getIsSorted()}
            <th
              style:width="{header.getSize()}px"
              draggable="true"
              class:drag-over={dragId && dragId !== header.column.id}
              ondragstart={(e) => { dragId = header.column.id; e.dataTransfer?.setData('text/plain', header.column.id); }}
              ondragover={(e) => e.preventDefault()}
              ondrop={(e) => { e.preventDefault(); drop(header.column.id); }}
              aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
            >
              <div class="th">
                <button
                  class="sort"
                  disabled={!header.column.getCanSort()}
                  title={col?.kind === 'field' ? col.field.description + ' (Shift-click to sort by more than one column)' : col?.label}
                  onclick={header.column.getToggleSortingHandler()}
                >
                  {col?.label ?? header.column.id}
                  {#if col?.cost === 'high'}<span class="cost" title="Expensive field: uses more API rate limit">$</span>{/if}
                  {#if sorted}
                    <span class="arrow">{sorted === 'asc' ? '▲' : '▼'}{#if view.sort.length > 1}<sub>{header.column.getSortIndex() + 1}</sub>{/if}</span>
                  {/if}
                </button>
                <span class="tools">
                  {#if header.column.getCanGroup()}
                    <button class="tool" class:on={view.groupBy === header.column.id} title="Group by this column" onclick={() => toggleGroup(header.column.id)}>⊞</button>
                  {/if}
                  <button class="tool" title="Hide column" onclick={() => hide(header.column.id)}>×</button>
                </span>
              </div>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="resizer"
                class:resizing={header.column.getIsResizing()}
                onmousedown={(e) => header.getResizeHandler()(e)}
                ontouchstart={(e) => header.getResizeHandler()(e)}
              ></div>
            </th>
          {/each}
        </tr>
      {/each}
    </thead>
    <tbody>
      {#each table.getRowModel().rows as row (row.id)}
        {#if row.getIsGrouped()}
          <tr class="group-row">
            <td colspan={visibleCount}>
              <button class="group-toggle" onclick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()}>
                <span class="caret">{row.getIsExpanded() ? '▾' : '▸'}</span>
                <span class="group-name">{String(row.groupingValue ?? '')}</span>
                <span class="count">{row.subRows.length}</span>
              </button>
            </td>
          </tr>
        {:else}
          <tr>
            {#each row.getVisibleCells() as cell (cell.id)}
              {@const col = colById.get(cell.column.id)}
              <td style:width="{cell.column.getSize()}px">
                {#if !col}
                  <span class="muted">?</span>
                {:else if col.kind === 'actions'}
                  <ActionsCell pr={row.original.pr} {client} onDone={onActionDone} {onWriteDenied} />
                {:else}
                  {@const state = cellFor(col, row.original)}
                  {#if state.kind === 'value'}
                    <CellView cell={state.cell} />
                  {:else if state.kind === 'forbidden'}
                    <span class="forbidden" title={permissionHint(state.requires)}>no access</span>
                  {:else}
                    <span class="muted">…</span>
                  {/if}
                {/if}
              </td>
            {/each}
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-raised); }
  .grid { border-collapse: separate; border-spacing: 0; table-layout: fixed; min-width: 100%; }
  th, td { padding: 5px 8px; border-bottom: 1px solid var(--border-soft); overflow: hidden; text-align: left; vertical-align: middle; }
  td { white-space: nowrap; }
  th { position: sticky; top: 0; z-index: 2; background: var(--bg-head); font-weight: 600; font-size: 12px; color: var(--muted); user-select: none; }
  th.drag-over:hover { box-shadow: inset 2px 0 0 var(--accent); }
  .th { display: flex; align-items: center; gap: 2px; }
  .sort { flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sort:disabled { cursor: default; }
  .arrow { color: var(--accent); margin-left: 2px; }
  .cost { color: var(--warn); margin-left: 3px; font-weight: 700; }
  .tools { display: inline-flex; opacity: 0; transition: opacity .1s; }
  th:hover .tools, th:focus-within .tools { opacity: 1; }
  .tool { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 3px; font-size: 13px; }
  .tool:hover, .tool.on { color: var(--accent); }
  .resizer { position: absolute; right: 0; top: 0; height: 100%; width: 5px; cursor: col-resize; touch-action: none; }
  .resizer:hover, .resizer.resizing { background: var(--accent); }
  th { position: sticky; }
  tbody tr:not(.group-row):hover td { background: var(--hover); }
  .group-row td { background: var(--bg-group); padding: 4px 8px; }
  .group-toggle { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
  .caret { width: 12px; color: var(--muted); }
  .count { font-weight: 500; font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; }
  .forbidden { color: var(--warn); font-size: 12px; cursor: help; border-bottom: 1px dotted currentColor; }
  .muted { color: var(--muted); }
</style>
