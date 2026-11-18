import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { z } from 'zod';
import { configSchema, type ColumnEntry, type Config, type ViewConfig } from './schema';
import { migrate } from './migrations';
import { checkLinkTemplate, checkRegex } from './computed';
import { FIELDS, ACTIONS_COLUMN_ID } from '../fields/registry';

export const MAX_CONFIG_BYTES = 256 * 1024;

/** Where the published JSON Schema lives. Change this when you fork or deploy elsewhere. */
export const SCHEMA_URL = 'https://djf1982.github.io/prboard/prboard.schema.json';

export interface ConfigError {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; config: Config; migratedFrom?: number } | { ok: false; errors: ConfigError[] };

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out || '(root)';
}

/** Parses YAML or JSON text. Never evaluates anything. */
export function parseConfigText(text: string): ParseResult {
  if (text.length > MAX_CONFIG_BYTES) return { ok: false, errors: [{ path: '(root)', message: 'config is larger than 256 KB' }] };
  let raw: unknown;
  try {
    raw = parseYaml(text, { maxAliasCount: 20, prettyErrors: true, uniqueKeys: true });
  } catch (e) {
    return { ok: false, errors: [{ path: '(root)', message: `could not read YAML/JSON: ${(e as Error).message}` }] };
  }
  return parseConfigValue(raw);
}

export function parseConfigValue(raw: unknown): ParseResult {
  const m = migrate(raw);
  if (m.error) return { ok: false, errors: [{ path: 'version', message: m.error.replace(/^version: /, '') }] };
  const res = configSchema.safeParse(m.value);
  if (!res.success) return { ok: false, errors: zodErrors(res.error) };
  const errors = semanticErrors(res.data);
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: res.data, migratedFrom: m.from };
}

function zodErrors(err: z.ZodError): ConfigError[] {
  return err.issues.map((i) => ({ path: formatPath(i.path), message: i.message }));
}

export function columnId(c: ColumnEntry): string {
  return typeof c === 'string' ? c : c.id;
}

/** Checks that need the field registry: unknown ids, duplicates, regex and link safety. */
export function semanticErrors(config: Config): ConfigError[] {
  const errors: ConfigError[] = [];
  const names = new Set<string>();
  config.views.forEach((view, vi) => {
    const vp = `views[${vi}]`;
    if (names.has(view.name)) errors.push({ path: `${vp}.name`, message: `duplicate view name '${view.name}'` });
    names.add(view.name);
    const ids = new Set<string>();
    view.columns.forEach((col, ci) => {
      const cp = `${vp}.columns[${ci}]`;
      const cid = columnId(col);
      if (ids.has(cid)) errors.push({ path: cp, message: `duplicate column '${cid}'` });
      ids.add(cid);
      if (typeof col === 'string' || col.from === undefined) {
        if (cid !== ACTIONS_COLUMN_ID && !FIELDS.has(cid)) errors.push({ path: cp, message: unknownField(cid) });
        return;
      }
      if (FIELDS.has(cid) || cid === ACTIONS_COLUMN_ID)
        errors.push({ path: `${cp}.id`, message: `'${cid}' is a built-in field; pick another id for a computed column` });
      if (!FIELDS.has(col.from)) errors.push({ path: `${cp}.from`, message: unknownField(col.from) });
      if (col.regex !== undefined) {
        const e = checkRegex(col.regex);
        if (e) errors.push({ path: `${cp}.regex`, message: e });
      }
      if (col.link !== undefined) {
        const e = checkLinkTemplate(col.link);
        if (e) errors.push({ path: `${cp}.link`, message: e });
      }
    });
    const sortable = (f: string) => FIELDS.has(f) || view.columns.some((c) => typeof c !== 'string' && c.from !== undefined && c.id === f);
    if (view.groupBy !== undefined && !sortable(view.groupBy))
      errors.push({ path: `${vp}.groupBy`, message: unknownField(view.groupBy, view) });
    view.sort.forEach((s, si) => {
      if (!sortable(s.field)) errors.push({ path: `${vp}.sort[${si}].field`, message: unknownField(s.field, view) });
    });
  });
  return errors;
}

function unknownField(id: string, view?: ViewConfig): string {
  const candidates = [...FIELDS.keys(), ACTIONS_COLUMN_ID];
  if (view) for (const c of view.columns) if (typeof c !== 'string' && c.from !== undefined) candidates.push(c.id);
  const hint = didYouMean(id, candidates);
  return `unknown field '${id}'${hint ? ` — did you mean '${hint}'?` : ''}`;
}

export function didYouMean(input: string, candidates: string[]): string | undefined {
  const lower = input.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const prefix = candidates.find((c) => lower.length >= 3 && c.toLowerCase().startsWith(lower));
  if (prefix) return prefix;
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(lower, c.toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(input.length / 4)) ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Writes a config in a tidy, compact form. Columns with only an id become plain strings. */
export function normaliseConfig(config: Config): Config {
  return {
    ...(config.$schema ? { $schema: config.$schema } : {}),
    version: config.version,
    refreshSeconds: config.refreshSeconds,
    views: config.views.map((v) => ({
      name: v.name,
      query: v.query,
      ...(v.groupBy ? { groupBy: v.groupBy } : {}),
      sort: v.sort.map((s) => ({ field: s.field, dir: s.dir })),
      columns: v.columns.map((c) => {
        if (typeof c === 'string') return c;
        const o = Object.fromEntries(Object.entries(c).filter(([, val]) => val !== undefined && val !== false)) as typeof c;
        return Object.keys(o).length === 1 ? o.id : o;
      }),
    })),
  };
}

export function serialiseConfig(config: Config, format: 'yaml' | 'json' = 'yaml'): string {
  const n = normaliseConfig(config);
  if (format === 'json') return JSON.stringify(n, null, 2) + '\n';
  return `# yaml-language-server: $schema=${SCHEMA_URL}\n` + stringifyYaml(n, { lineWidth: 0, flowCollectionPadding: true });
}
