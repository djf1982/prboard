import { defineField, EMPTY, type FieldDef } from './types';
import type { PullRequestNode } from '../github/types';

const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAIL = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
/** Cancelled runs are usually superseded by a newer run; GitHub's web page shows them grey, not red. */
const CANCELLED = new Set(['CANCELLED', 'STALE']);

export interface ChecksSummary {
  rollup: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  cancelled: number;
  failingNames: string[];
  pendingNames: string[];
  cancelledNames: string[];
}

export function summariseChecks(pr: PullRequestNode): ChecksSummary | null | undefined {
  if (pr.statusCheckRollup === undefined) return undefined;
  const r = pr.statusCheckRollup;
  if (!r) return null; // no checks on the head commit
  let passed = 0, failed = 0, pending = 0, cancelled = 0;
  const counts = [...(r.contexts.checkRunCountsByState ?? []), ...(r.contexts.statusContextCountsByState ?? [])];
  for (const { state, count } of counts) {
    if (PASS.has(state)) passed += count;
    else if (FAIL.has(state)) failed += count;
    else if (CANCELLED.has(state)) cancelled += count;
    else if (state !== 'COMPLETED') pending += count;
  }
  const failingNames: string[] = [];
  const pendingNames: string[] = [];
  const cancelledNames: string[] = [];
  for (const c of r.contexts.nodes) {
    const name = c.__typename === 'CheckRun' ? c.name : c.context;
    const state = c.__typename === 'CheckRun' ? (c.status === 'COMPLETED' ? c.conclusion ?? 'PENDING' : c.status) : c.state;
    if (FAIL.has(state)) failingNames.push(name);
    else if (CANCELLED.has(state)) cancelledNames.push(name);
    else if (!PASS.has(state)) pendingNames.push(name);
  }
  return {
    rollup: r.state,
    total: r.contexts.totalCount,
    passed, failed, pending, cancelled,
    failingNames: [...new Set(failingNames)],
    pendingNames: [...new Set(pendingNames)],
    cancelledNames: [...new Set(cancelledNames)],
  };
}

export const checksFields: FieldDef[] = [
  defineField<ChecksSummary | null | undefined>({
    id: 'checks', label: 'Checks',
    description: 'Passing / total checks on the head commit. Hover for failing names (first 100 checks).',
    fragment:
      'statusCheckRollup { state contexts(first: 100) { totalCount checkRunCountsByState { state count } statusContextCountsByState { state count } nodes { __typename ... on CheckRun { name status conclusion } ... on StatusContext { context state } } } }',
    cost: 'high', width: 100,
    get: summariseChecks,
    sortValue: (v) => (v ? (v.failed ? -1000 - v.failed : v.pending ? -v.pending : v.total ? v.passed / v.total : 0) : undefined),
    groupValue: (v) => (v === undefined ? 'Unknown' : v === null ? 'No checks' : v.failed ? 'Failing' : v.pending ? 'Pending' : v.cancelled ? 'Some cancelled' : 'Passing'),
    display: (v, pr) => {
      if (v === undefined) return EMPTY;
      if (v === null) return { text: 'none', tone: 'muted' };
      const lines: string[] = [];
      if (v.failingNames.length) lines.push('Failing: ' + v.failingNames.join(', '));
      if (v.pendingNames.length) lines.push('Pending: ' + v.pendingNames.join(', '));
      if (v.cancelledNames.length) lines.push('Cancelled: ' + v.cancelledNames.join(', '));
      if (!lines.length) lines.push('All checks passed');
      lines.push('Required checks that have not started yet are not counted.');
      if (v.total > 100) lines.push(`(names from the first 100 of ${v.total} checks)`);
      return {
        text: `${v.passed}/${v.total}`,
        title: lines.join('\n'),
        href: `${pr.url}/checks`,
        tone: v.failed ? 'bad' : v.pending ? 'warn' : v.cancelled ? 'muted' : 'good',
        icon: v.failed ? 'x' : v.pending ? 'clock' : v.cancelled ? 'dot' : 'check',
        pill: true,
      };
    },
    // Fine-grained tokens have no Checks permission, so they may not see check runs (GitHub Actions).
    // Commit statuses: read covers legacy status contexts only.
    requires: ['Pull requests: read', 'Commit statuses: read', 'Classic token (repo scope) for check runs'],
  }),
];
