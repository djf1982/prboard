import { firstMatch, prefixCell, regexCell, type ComputedSource, type ComputedSpec } from '../config/computed';
import { runRegexJobs, RegexTimeoutError } from '../config/regexRunner';
import { FIELDS } from '../fields/registry';
import type { Cell } from '../fields/types';
import { computedKey, resolveView, type Row } from './columns';
import type { ViewConfig } from '../config/schema';
import type { PullRequestNode } from '../github/types';

export function sourceOf(fieldId: string, pr: PullRequestNode): ComputedSource {
  const field = FIELDS.get(fieldId);
  if (!field) return { text: '', items: [] };
  const v = field.get(pr);
  const cell = field.display(v, pr);
  const text = typeof v === 'string' ? v : cell.text;
  const items = Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : cell.chips?.map((c) => c.text) ?? (text ? [text] : []);
  return { text, items };
}

/** Fills row.computed for every computed column in the views. Regexes run in a worker with a timeout. */
export async function computeColumns(views: ViewConfig[], rows: Row[]): Promise<string[]> {
  const specs = new Map<string, ComputedSpec>();
  for (const v of views) for (const c of resolveView(v)) if (c.kind === 'computed') specs.set(computedKey(c.spec), c.spec);
  const errors: string[] = [];
  const regexSpecs = [...specs.entries()].filter(([, s]) => s.regex);
  for (const [key, spec] of specs) {
    if (spec.prefix) for (const r of rows) r.computed.set(key, prefixCell(spec.prefix, sourceOf(spec.from, r.pr)));
  }
  if (!regexSpecs.length) return errors;
  const jobs = regexSpecs.map(([, s]) => ({ pattern: s.regex!, inputs: rows.map((r) => sourceOf(s.from, r.pr).text) }));
  let results: (string[] | null)[][];
  try {
    results = await runRegexJobs(jobs);
  } catch (e) {
    const msg = e instanceof RegexTimeoutError ? e.message : `Computed columns failed: ${(e as Error).message}`;
    errors.push(msg);
    const errCell: Cell = { text: 'regex error', tone: 'bad', title: msg };
    for (const [key] of regexSpecs) for (const r of rows) r.computed.set(key, errCell);
    return errors;
  }
  regexSpecs.forEach(([key, spec], i) => {
    rows.forEach((r, j) => r.computed.set(key, regexCell(spec, results[i]?.[j] ?? null)));
  });
  return errors;
}

/** Synchronous version for tests and small inputs. */
export function computeCellSync(spec: ComputedSpec, pr: PullRequestNode): Cell {
  const src = sourceOf(spec.from, pr);
  if (spec.prefix) return prefixCell(spec.prefix, src);
  return regexCell(spec, firstMatch(spec.regex!, src.text));
}
