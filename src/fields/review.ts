import { defineField, EMPTY, type FieldDef, type Tone } from './types';
import { titleCase } from './format';

type Decision = NonNullable<import('../github/types').PullRequestNode['reviewDecision']> | null | undefined;

export const reviewFields: FieldDef[] = [
  defineField<Decision>({
    id: 'reviewDecision', label: 'Review', description: 'Overall review decision: approved, changes requested or review required.',
    fragment: 'reviewDecision', width: 184,
    get: (pr) => pr.reviewDecision,
    sortValue: (v) => (v === 'APPROVED' ? 0 : v === 'REVIEW_REQUIRED' ? 1 : v === 'CHANGES_REQUESTED' ? 2 : 3),
    groupValue: (v) => (v ? titleCase(v) : 'No review needed'),
    display: (v) => {
      if (!v) return { text: 'none', tone: 'muted' };
      const tone: Tone = v === 'APPROVED' ? 'good' : v === 'CHANGES_REQUESTED' ? 'bad' : 'warn';
      const icon = v === 'APPROVED' ? 'check' : v === 'CHANGES_REQUESTED' ? 'x' : 'eye';
      return { text: titleCase(v).toLowerCase(), tone, icon, pill: true };
    },
    requires: ['Pull requests: read'],
  }),
  defineField<string[]>({
    id: 'pendingReviewers', label: 'Pending reviewers', description: 'People and teams whose review is still requested (first 20).',
    fragment: 'reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } ... on Bot { login } ... on Mannequin { login } } } }',
    width: 180,
    get: (pr) =>
      pr.reviewRequests?.nodes
        .map((n) => n.requestedReviewer)
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => (r.__typename === 'Team' ? `team/${r.slug ?? '?'}` : r.login ?? '?'))
        .filter((v, i, all) => all.indexOf(v) === i) ?? [],
    sortValue: (v) => v.length,
    groupValue: (v) => (v.length ? v.join(', ') : 'Nobody'),
    display: (v) => (v.length ? { text: v.join(', '), chips: v.map((t) => ({ text: t, tone: 'warn' as Tone })) } : { text: '', tone: 'muted' }),
    requires: ['Pull requests: read', 'Members: read'],
  }),
  defineField<{ login: string; state: string }[]>({
    id: 'latestReviews', label: 'Reviews', description: 'The latest review from each reviewer (first 20).',
    fragment: 'latestReviews(first: 20) { nodes { state author { login } } }', width: 180,
    get: (pr) =>
      pr.latestReviews?.nodes
        .filter((n) => n.state !== 'DISMISSED' && n.state !== 'PENDING')
        .map((n) => ({ login: n.author?.login ?? 'ghost', state: n.state })) ?? [],
    sortValue: (v) => v.filter((r) => r.state === 'APPROVED').length,
    display: (v) => ({
      text: v.map((r) => `${r.login}: ${r.state.toLowerCase()}`).join(', '),
      chips: v.map((r) => ({
        text: r.login,
        tone: (r.state === 'APPROVED' ? 'good' : r.state === 'CHANGES_REQUESTED' ? 'bad' : 'muted') as Tone,
        title: titleCase(r.state),
      })),
    }),
    requires: ['Pull requests: read'],
  }),
  defineField<{ unresolved: number; total: number; capped: boolean } | undefined>({
    id: 'unresolvedThreads', label: 'Open threads',
    description: 'Unresolved review threads. Counts the first 100 threads only.',
    fragment: 'reviewThreads(first: 100) { totalCount nodes { isResolved } }', width: 110, cost: 'high',
    get: (pr) => {
      const rt = pr.reviewThreads;
      if (!rt) return undefined;
      return { unresolved: rt.nodes.filter((n) => !n.isResolved).length, total: rt.totalCount, capped: rt.totalCount > rt.nodes.length };
    },
    sortValue: (v) => v?.unresolved,
    groupValue: (v) => (!v ? 'Unknown' : v.unresolved ? 'Has open threads' : 'All resolved'),
    display: (v) => {
      if (!v) return EMPTY;
      const text = v.capped ? `${v.unresolved}+` : String(v.unresolved);
      const title = v.capped ? `Counted the first 100 of ${v.total} threads` : `${v.unresolved} of ${v.total} threads unresolved`;
      return { text, title, tone: v.unresolved ? 'warn' : 'muted', icon: 'comment' };
    },
    requires: ['Pull requests: read'],
  }),
];
