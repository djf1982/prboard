import { defineField, EMPTY, type CellDetails, type DetailGroup, type DetailItem, type FieldDef, type Tone } from './types';
import type { PullRequestNode } from '../github/types';

const PASS = new Set(['SUCCESS', 'NEUTRAL']);
const SKIP = new Set(['SKIPPED']);
const FAIL = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
/** Cancelled runs are usually superseded by a newer run; GitHub's web page shows them grey, not red. */
const CANCELLED = new Set(['CANCELLED', 'STALE']);

export type CheckBucket = 'failing' | 'pending' | 'cancelled' | 'passed' | 'skipped';

export interface CheckItem {
  /** Job name, for example "Lint". */
  name: string;
  /** Workflow name, for example "Build & Analysis", when the check name has one. */
  workflow?: string;
  url?: string;
  bucket: CheckBucket;
}

export interface ChecksSummary {
  rollup: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  cancelled: number;
  skipped: number;
  /** Checks listed by GitHub (first 100), one entry per name and bucket. */
  items: CheckItem[];
  failingNames: string[];
  pendingNames: string[];
  cancelledNames: string[];
}

function bucketOf(state: string): CheckBucket {
  if (FAIL.has(state)) return 'failing';
  if (CANCELLED.has(state)) return 'cancelled';
  if (PASS.has(state)) return 'passed';
  if (SKIP.has(state)) return 'skipped';
  return 'pending';
}

/** "Build & Analysis / Lint" -> { workflow: "Build & Analysis", name: "Lint" } */
export function splitCheckName(full: string): { name: string; workflow?: string } {
  const i = full.indexOf(' / ');
  return i > 0 ? { workflow: full.slice(0, i).trim(), name: full.slice(i + 3).trim() } : { name: full.trim() };
}

export function summariseChecks(pr: PullRequestNode): ChecksSummary | null | undefined {
  if (pr.statusCheckRollup === undefined) return undefined;
  const r = pr.statusCheckRollup;
  if (!r) return null; // no checks on the head commit
  let passed = 0, failed = 0, pending = 0, cancelled = 0, skipped = 0;
  const counts = [...(r.contexts.checkRunCountsByState ?? []), ...(r.contexts.statusContextCountsByState ?? [])];
  for (const { state, count } of counts) {
    if (state === 'COMPLETED') continue;
    const b = bucketOf(state);
    if (b === 'passed') passed += count;
    else if (b === 'skipped') skipped += count;
    else if (b === 'failing') failed += count;
    else if (b === 'cancelled') cancelled += count;
    else pending += count;
  }
  const seen = new Set<string>();
  const items: CheckItem[] = [];
  for (const c of r.contexts.nodes) {
    const full = c.__typename === 'CheckRun' ? c.name : c.context;
    const state = c.__typename === 'CheckRun' ? (c.status === 'COMPLETED' ? c.conclusion ?? 'PENDING' : c.status) : c.state;
    const bucket = bucketOf(state);
    const key = bucket + '|' + full;
    if (seen.has(key)) continue;
    seen.add(key);
    const url = (c.__typename === 'CheckRun' ? c.detailsUrl : c.targetUrl) ?? undefined;
    items.push({ ...splitCheckName(full), url, bucket });
  }
  const names = (b: CheckBucket) => items.filter((i) => i.bucket === b).map((i) => (i.workflow ? `${i.workflow} / ${i.name}` : i.name));
  return {
    rollup: r.state,
    total: r.contexts.totalCount,
    // Passed includes skipped, as GitHub's own count does.
    passed: passed + skipped,
    failed, pending, cancelled, skipped,
    items,
    failingNames: names('failing'),
    pendingNames: names('pending'),
    cancelledNames: names('cancelled'),
  };
}

const GROUPS: { bucket: CheckBucket; label: string; tone: Tone; collapsed?: boolean }[] = [
  { bucket: 'failing', label: 'Failing', tone: 'bad' },
  { bucket: 'pending', label: 'Pending', tone: 'warn' },
  { bucket: 'cancelled', label: 'Cancelled', tone: 'muted' },
  { bucket: 'passed', label: 'Passed', tone: 'good', collapsed: true },
  { bucket: 'skipped', label: 'Skipped', tone: 'muted', collapsed: true },
];

export function checksDetails(v: ChecksSummary, prUrl: string): CellDetails {
  const groups: DetailGroup[] = GROUPS.map((g) => ({
    label: g.label,
    tone: g.tone,
    collapsed: g.collapsed,
    items: v.items
      .filter((i) => i.bucket === g.bucket)
      .sort((a, b) => (a.workflow ?? '').localeCompare(b.workflow ?? '') || a.name.localeCompare(b.name))
      .map((i): DetailItem => ({ text: i.name, meta: i.workflow, href: i.url })),
  })).filter((g) => g.items.length);
  const notes = ['Required checks that have not started yet are not listed.'];
  if (v.total > 100) notes.unshift(`Showing the first 100 of ${v.total} checks.`);
  // The group headers carry the per-status counts, so the heading stays short.
  return { heading: `${v.passed}/${v.total} passed`, link: { text: 'Open on GitHub', href: `${prUrl}/checks` }, groups, note: notes.join(' ') };
}

export const checksFields: FieldDef[] = [
  defineField<ChecksSummary | null | undefined>({
    id: 'checks', label: 'Checks',
    description: 'Passing / total checks on the head commit. Click for the list, grouped by status (first 100 checks).',
    fragment:
      'statusCheckRollup { state contexts(first: 100) { totalCount checkRunCountsByState { state count } statusContextCountsByState { state count } nodes { __typename ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl } } } }',
    cost: 'high', width: 110,
    get: summariseChecks,
    sortValue: (v) => (v ? (v.failed ? -1000 - v.failed : v.pending ? -v.pending : v.total ? v.passed / v.total : 0) : undefined),
    groupValue: (v) => (v === undefined ? 'Unknown' : v === null ? 'No checks' : v.failed ? 'Failing' : v.pending ? 'Pending' : v.cancelled ? 'Some cancelled' : 'Passing'),
    display: (v, pr) => {
      if (v === undefined) return EMPTY;
      if (v === null) return { text: 'none', tone: 'muted' };
      return {
        text: `${v.passed}/${v.total}`,
        tone: v.failed ? 'bad' : v.pending ? 'warn' : v.cancelled ? 'muted' : 'good',
        icon: v.failed ? 'x' : v.pending ? 'clock' : v.cancelled ? 'dot' : 'check',
        pill: true,
        details: checksDetails(v, pr.url),
      };
    },
    // Fine-grained tokens have no Checks permission, so they may not see check runs (GitHub Actions).
    requires: ['Pull requests: read', 'Commit statuses: read', 'Classic token (repo scope) for check runs'],
  }),
];
