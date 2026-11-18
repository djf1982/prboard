import type { FieldDef, Cell, Cost, Permission } from '../fields/types';
import { FIELDS, ACTIONS_COLUMN_ID } from '../fields/registry';
import { ACTIONS, ACTIONS_FRAGMENTS } from '../actions/registry';
import type { ColumnEntry, Config, ViewConfig } from '../config/schema';
import type { ComputedSpec } from '../config/computed';
import { topLevelKeys } from '../github/fragments';
import type { PullRequestNode } from '../github/types';

export interface Row {
  pr: PullRequestNode;
  /** Response keys GitHub refused for this PR, usually because of token permissions. */
  denied: Set<string>;
  /** Computed column cells, keyed by computedKey(spec). */
  computed: Map<string, Cell>;
}

export type ResolvedColumn =
  | (Base & { kind: 'field'; field: FieldDef })
  | (Base & { kind: 'computed'; spec: ComputedSpec; source: FieldDef })
  | (Base & { kind: 'actions' });

interface Base {
  id: string;
  label: string;
  width: number;
  hidden: boolean;
  /** Not in the config's columns list; present only because sort or groupBy uses it. */
  aux: boolean;
  cost: Cost;
  requires: Permission[];
  /** Top-level response keys this column reads, to detect permission errors. */
  keys: string[];
}

export function computedKey(spec: ComputedSpec): string {
  return JSON.stringify([spec.from, spec.regex ?? null, spec.prefix ?? null, spec.link ?? null]);
}

export function resolveColumn(entry: ColumnEntry): ResolvedColumn | null {
  const o = typeof entry === 'string' ? { id: entry } : entry;
  const hidden = 'hidden' in o && !!o.hidden;
  if (o.id === ACTIONS_COLUMN_ID && !('from' in o && o.from)) {
    return {
      kind: 'actions', id: o.id, label: ('label' in o && o.label) || 'Actions', width: ('width' in o && o.width) || 56,
      hidden, aux: false, cost: 'low', requires: [...new Set(ACTIONS.flatMap((a) => a.requires))],
      keys: [...new Set(ACTIONS_FRAGMENTS.flatMap(topLevelKeys))],
    };
  }
  if ('from' in o && o.from) {
    const source = FIELDS.get(o.from);
    if (!source) return null;
    const spec: ComputedSpec = { id: o.id, from: o.from, regex: o.regex, link: o.link, prefix: o.prefix };
    return {
      kind: 'computed', id: o.id, label: o.label || o.id, width: o.width || 140, hidden, aux: false, spec, source,
      cost: source.cost ?? 'low', requires: source.requires ?? [], keys: topLevelKeys(source.fragment),
    };
  }
  const field = FIELDS.get(o.id);
  if (!field) return null;
  return {
    kind: 'field', id: field.id, label: ('label' in o && o.label) || field.label, width: ('width' in o && o.width) || field.width || 140,
    hidden, aux: false, field, cost: field.cost ?? 'low', requires: field.requires ?? [], keys: topLevelKeys(field.fragment),
  };
}

/** The columns of a view, plus hidden helper columns for sort and groupBy fields not in the list. */
export function resolveView(view: ViewConfig): ResolvedColumn[] {
  const cols = view.columns.map(resolveColumn).filter((c): c is ResolvedColumn => !!c);
  const ids = new Set(cols.map((c) => c.id));
  const extra = [view.groupBy, ...view.sort.map((s) => s.field)].filter((f): f is string => !!f && !ids.has(f));
  for (const id of new Set(extra)) {
    const c = resolveColumn(id);
    if (c && c.kind === 'field') { cols.push({ ...c, hidden: true, aux: true }); ids.add(id); }
  }
  return cols;
}

/** Columns whose data must be fetched: visible ones, plus any used by sort or groupBy. */
export function columnsToFetch(view: ViewConfig): ResolvedColumn[] {
  const used = new Set([view.groupBy, ...view.sort.map((s) => s.field)].filter(Boolean));
  return resolveView(view).filter((c) => !c.hidden || c.aux || used.has(c.id));
}

/** All fragments the active views need. Query only what is displayed. */
export function fragmentsFor(views: ViewConfig[]): string[] {
  const out = new Set<string>();
  for (const view of views) {
    for (const c of columnsToFetch(view)) {
      if (c.kind === 'field') out.add(c.field.fragment);
      else if (c.kind === 'computed') out.add(c.source.fragment);
      else ACTIONS_FRAGMENTS.forEach((f) => out.add(f));
    }
  }
  return [...out];
}

export function configFragments(config: Config): string[] {
  return fragmentsFor(config.views);
}

export function viewCost(view: ViewConfig): Cost {
  return columnsToFetch(view).some((c) => c.cost === 'high') ? 'high' : 'low';
}

/** Value used by TanStack for sorting. undefined sorts last. */
export function sortValueOf(col: ResolvedColumn, row: Row): string | number | undefined {
  if (col.kind === 'actions') return undefined;
  if (col.kind === 'computed') return row.computed.get(computedKey(col.spec))?.text.toLowerCase() || undefined;
  const v = col.field.get(row.pr);
  if (col.field.sortValue) return col.field.sortValue(v);
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number' || typeof v === 'string') return typeof v === 'string' ? v.toLowerCase() : v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.join(',').toLowerCase() || undefined;
  return undefined;
}

export function groupValueOf(col: ResolvedColumn, row: Row): string {
  if (col.kind === 'actions') return '';
  if (col.kind === 'computed') return row.computed.get(computedKey(col.spec))?.text || '(none)';
  const v = col.field.get(row.pr);
  if (col.field.groupValue) return col.field.groupValue(v);
  return col.field.display(v, row.pr).text || '(none)';
}

export type CellState = { kind: 'value'; cell: Cell } | { kind: 'forbidden'; requires: Permission[] } | { kind: 'loading' };

export function cellFor(col: ResolvedColumn, row: Row): CellState {
  // Mark a cell as forbidden only when GitHub refused the field and returned no value for it.
  const pr = row.pr as unknown as Record<string, unknown>;
  if (col.keys.some((k) => row.denied.has(k) && (pr[k] === null || pr[k] === undefined))) return { kind: 'forbidden', requires: col.requires };
  if (col.kind === 'computed') {
    const c = row.computed.get(computedKey(col.spec));
    return c ? { kind: 'value', cell: c } : { kind: 'loading' };
  }
  if (col.kind === 'actions') return { kind: 'value', cell: { text: '' } };
  return { kind: 'value', cell: col.field.display(col.field.get(row.pr), row.pr) };
}
