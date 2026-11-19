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
  import Icon from './Icon.svelte';
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

  const MIN_W = 50;
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
    // The title column takes the space left over, so it has no fixed width to drag.
    enableResizing: c.id !== 'title',
    size: c.width,
    minSize: MIN_W,
    maxSize: 2000,
  }));

  // State slices are read from the config, and every change is written back to it.
  const sorting = $derived<SortingState>(view.sort.map((s) => ({ id: s.field, desc: s.dir === 'desc' })));
  const grouping = $derived(view.groupBy ? [view.groupBy] : []);
  const columnVisibility = $derived(Object.fromEntries(columns.map((c) => [c.id, !c.hidden])));
  const columnOrder = $derived(columns.map((c) => c.id));
  const columnSizing = $derived(Object.fromEntries(columns.map((c) => [c.id, c.width])));
  let expanded = $state<ExpandedState>(true);
  // Transient drag state, held here so the guide line can follow the pointer.
  let resizing = $state<{ columnSizingStart: [string, number][]; deltaOffset: number | null; deltaPercentage: number | null; isResizingColumn: false | string; startOffset: number | null; startSize: number | null }>({
    columnSizingStart: [], deltaOffset: null, deltaPercentage: null, isResizingColumn: false, startOffset: null, startSize: null,
  });
  let guideBase = $state(0);


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
      get columnResizing() { return resizing; },
    },
    onColumnResizingChange: (u: Updater<typeof resizing>) => { resizing = resolve(u, resizing); },
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

  function startResize(e: MouseEvent | TouchEvent, header: { getResizeHandler: () => (e: unknown) => void }) {
    const th = (e.currentTarget as HTMLElement).closest('th');
    if (th) guideBase = th.offsetLeft + th.offsetWidth - 1;
    header.getResizeHandler()(e);
  }

  // Double-click on a handle goes back to the default width.
  function resetWidth(id: string) {
    onViewChange((v) => {
      const i = v.columns.findIndex((c) => (typeof c === 'string' ? c : c.id) === id);
      const cur = v.columns[i];
      if (i < 0 || !cur || typeof cur === 'string') return;
      const rest: Record<string, unknown> = { ...(cur as Record<string, unknown>) };
      delete rest.width;
      v.columns[i] = (Object.keys(rest).length === 1 ? rest.id : rest) as ColumnEntry;
    });
  }

  const resizingCol = $derived(resizing.isResizingColumn ? colById.get(resizing.isResizingColumn) : undefined);
  const guideWidth = $derived(resizingCol && resizing.startSize !== null ? Math.max(MIN_W, Math.round(resizing.startSize + (resizing.deltaOffset ?? 0))) : 0);
  const guideLeft = $derived(resizing.startSize !== null ? guideBase + (guideWidth - resizing.startSize) : 0);

  function hide(id: string) {
    onViewChange((v) => setEntry(v, id, { hidden: true }));
  }

  function toggleGroup(id: string) {
    onViewChange((v) => { v.groupBy = v.groupBy === id ? undefined : id; });
  }

  // The title column takes the leftover space, so it counts only its minimum here.
  // The table scrolls sideways only when the other columns truly do not fit.
  const TITLE_MIN = 220;
  function minWidth(): number {
    let w = 0;
    for (const h of table.getHeaderGroups()[0]?.headers ?? []) w += h.column.id === 'title' ? TITLE_MIN : h.getSize();
    return w;
  }

  // The title shows the number after it, unless a number column already shows it.
  const showsNumber = $derived(columns.some((c) => c.id === 'number' && !c.hidden));
  const visibleCount = $derived(columns.filter((c) => !c.hidden).length);
  const permissionHint = (req: string[]) => `Your token cannot read this. It needs: ${req.join(', ')}.`;
</script>

<div class="wrap" class:is-resizing={!!resizing.isResizingColumn}>
  {#if resizingCol}
    <div class="guide" style:left="{guideLeft}px" aria-hidden="true"><span class="guide-label">{guideWidth}px</span></div>
  {/if}
  <table class="grid" style:min-width="{minWidth()}px">
    <thead>
      {#each table.getHeaderGroups() as group (group.id)}
        <tr>
          {#each group.headers as header (header.id)}
            {@const col = colById.get(header.column.id)}
            {@const sorted = header.column.getIsSorted()}
            <th
              style:width={header.column.id === 'title' ? undefined : `${header.getSize()}px`}
              class:flex={header.column.id === 'title'}
              class:drag-over={dragId && dragId !== header.column.id}
              ondragover={(e) => e.preventDefault()}
              ondrop={(e) => { e.preventDefault(); drop(header.column.id); }}
              aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
            >
              <!-- Only the label area starts a reorder drag, so the resize handle never does. -->
              <div class="th" class:th-actions={col?.kind === 'actions'} draggable="true" role="presentation"
                ondragstart={(e) => { dragId = header.column.id; e.dataTransfer?.setData('text/plain', header.column.id); }}
                ondragend={() => (dragId = null)}>
                <button
                  class="sort"
                  class:sr-label={col?.kind === 'actions'}
                  disabled={!header.column.getCanSort()}
                  title={col?.kind === 'field' ? col.field.description + ' (Shift-click to sort by more than one column)' : col?.label}
                  onclick={header.column.getToggleSortingHandler()}
                >
                  <span class="label-text">{col?.label ?? header.column.id}</span>
                  {#if col?.cost === 'high'}<span class="cost" title="Expensive field: uses more API rate limit"><Icon id="gauge" size={13} /></span>{/if}
                  {#if sorted}
                    <span class="arrow"><Icon id={sorted === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} />{#if view.sort.length > 1}<sub>{header.column.getSortIndex() + 1}</sub>{/if}</span>
                  {/if}
                </button>
                <span class="tools">
                  {#if header.column.getCanGroup()}
                    <button class="tool" class:on={view.groupBy === header.column.id} title={view.groupBy === header.column.id ? 'Stop grouping' : 'Group by this column'} aria-label="Group by {col?.label}" onclick={() => toggleGroup(header.column.id)}><Icon id="group" size={12} /></button>
                  {/if}
                  <button class="tool" title="Hide column" aria-label="Hide {col?.label}" onclick={() => hide(header.column.id)}><Icon id="eye-off" size={12} /></button>
                </span>
              </div>
              {#if header.column.getCanResize()}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="resizer"
                  class:resizing={header.column.getIsResizing()}
                  title="Drag to resize. Double-click to reset."
                  onmousedown={(e) => startResize(e, header)}
                  ontouchstart={(e) => startResize(e, header)}
                  ondblclick={() => resetWidth(header.column.id)}
                ></div>
              {/if}
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
                <span class="caret" class:open={row.getIsExpanded()}><Icon id="chevron" size={12} /></span>
                <span class="group-name">{String(row.groupingValue ?? '')}</span>
                <span class="count">{row.subRows.length}</span>
              </button>
            </td>
          </tr>
        {:else}
          <tr>
            {#each row.getVisibleCells() as cell (cell.id)}
              {@const col = colById.get(cell.column.id)}
              <td class:actions-cell={col?.kind === 'actions'}>
                {#if !col}
                  <span class="muted">?</span>
                {:else if col.kind === 'actions'}
                  <ActionsCell pr={row.original.pr} {client} onDone={onActionDone} {onWriteDenied} />
                {:else}
                  {@const state = cellFor(col, row.original)}
                  {#if state.kind === 'value'}
                    <CellView cell={col.id === 'title' && showsNumber ? { ...state.cell, meta: undefined } : state.cell} />
                  {:else if state.kind === 'forbidden'}
                    <span class="forbidden" title={permissionHint(state.requires)}><Icon id="lock" size={12} /> no access</span>
                  {:else}
                    <span class="loading-dot" aria-label="loading"></span>
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
  .wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-raised); box-shadow: var(--card-shadow); }
  .grid { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-variant-numeric: tabular-nums; }
  th, td { padding: 0 10px; height: 44px; border-bottom: 1px solid var(--border-soft); overflow: hidden; text-align: left; vertical-align: middle; }
  th:first-child, td:first-child { padding-left: 16px; }
  th:last-child, td:last-child { padding-right: 12px; }
  td { white-space: nowrap; transition: background-color .08s; }
  tbody tr:last-child td { border-bottom: 0; }
  th { position: sticky; top: 0; z-index: 2; height: 36px; background: var(--bg-head); font-weight: 500; font-size: 12px;
    color: var(--muted); user-select: none; border-bottom-color: var(--border); }
  th.drag-over:hover { box-shadow: inset 2px 0 0 var(--accent); }
  .th { display: flex; align-items: center; position: relative; min-width: 0; }
  .sort { all: unset; display: inline-flex; align-items: center; gap: 4px; flex: 1; min-width: 0; cursor: pointer; white-space: nowrap; }
  .label-text { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sort:disabled { cursor: default; }
  .sort:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .sort:hover:not(:disabled) { color: var(--fg); }
  .sr-label .label-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .arrow { display: inline-flex; align-items: center; color: var(--accent); flex: none; }
  .arrow sub { font-size: 9px; font-weight: 600; margin-left: 1px; }
  .cost { color: var(--warn); flex: none; display: inline-flex; align-items: center; }
  /* Hover tools float over the label, so they never take its space. */
  .tools { position: absolute; right: -2px; display: inline-flex; gap: 2px; padding-left: 16px; opacity: 0; pointer-events: none;
    background: linear-gradient(to right, transparent, var(--bg-head) 12px); transition: opacity .12s; }
  th:hover .tools, th:focus-within .tools { opacity: 1; pointer-events: auto; }
  .th-actions .tools { display: none; }
  .tool { all: unset; cursor: pointer; color: var(--muted); width: 20px; height: 20px; display: grid; place-items: center; border-radius: 4px; }
  .tool:hover { color: var(--fg); background: var(--hover); }
  .tool.on { color: var(--accent); background: var(--accent-soft); }
  .tool:focus-visible { outline: 2px solid var(--accent); }
  /* A wide, invisible hit area with a thin line in the middle. */
  .resizer { position: absolute; right: 0; top: 0; bottom: 0; width: 9px; cursor: col-resize; touch-action: none; z-index: 3; }
  .resizer::after { content: ''; position: absolute; left: 8px; top: 9px; bottom: 9px; width: 1px; background: var(--border); transition: background-color .12s, top .12s, bottom .12s; }
  th:hover .resizer::after { background: var(--border-strong); }
  .resizer:hover::after, .resizer.resizing::after { background: var(--accent); top: 4px; bottom: 4px; width: 2px; left: 7px; }
  th { overflow: visible; }
  th .th { overflow: hidden; }
  .wrap { position: relative; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
  .wrap::-webkit-scrollbar { height: 8px; }
  .wrap::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; border: 2px solid var(--bg-raised); }
  .wrap::-webkit-scrollbar-track { background: transparent; }
  .wrap.is-resizing, .wrap.is-resizing * { cursor: col-resize !important; user-select: none; }
  .guide { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--accent); z-index: 5; pointer-events: none; }
  .guide-label { position: absolute; top: 8px; left: 6px; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px;
    background: var(--accent); color: var(--accent-fg); white-space: nowrap; }
  tbody tr:not(.group-row):hover td { background: var(--row-hover); }
  .group-row td { background: var(--bg-group); height: 36px; border-bottom: 1px solid var(--border-soft); }
  .group-toggle { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12px; color: var(--fg-soft); }
  .group-toggle:hover { color: var(--fg); }
  .group-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .caret { display: inline-flex; color: var(--muted); transition: transform .15s var(--ease); }
  .caret.open { transform: rotate(90deg); }
  .count { font-weight: 600; font-size: 11px; color: var(--muted); background: var(--chip-bg); border-radius: 999px; min-width: 18px; height: 18px; padding: 0 5px; display: inline-grid; place-items: center; }
  .actions-cell { text-align: right; overflow: visible; }
  .forbidden { display: inline-flex; align-items: center; gap: 4px; color: var(--warn); font-size: 12px; cursor: help; }
  .loading-dot { display: inline-block; width: 24px; height: 8px; border-radius: 4px; background: var(--hover); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .45; } }
  .muted { color: var(--muted); }
</style>
