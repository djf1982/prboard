import { defineField, EMPTY, type FieldDef, type IconId, type Tone } from './types';
import { shortDate, titleCase } from './format';
import type { PullRequestNode } from '../github/types';

type AutoMerge = PullRequestNode['autoMergeRequest'];

export interface MergeStatus {
  /** Short text for the cell, also the group name. */
  label: string;
  tone: Tone;
  icon?: IconId;
  /** Hover text: what the status means and what to do. */
  help: string;
}

const FAILING_ROLLUP = new Set(['FAILURE', 'ERROR']);
const PENDING_ROLLUP = new Set(['PENDING', 'EXPECTED']);

/**
 * Turns GitHub's mergeStateStatus into a plain status with a reason.
 * GitHub reports BLOCKED for many causes, so this also reads mergeable,
 * reviewDecision and the check rollup to say which one applies.
 */
export function mergeStatus(pr: PullRequestNode): MergeStatus | undefined {
  const s = pr.mergeStateStatus;
  if (!s) return undefined;
  const reported = ` (GitHub reports ${s.toLowerCase()}.)`;
  // GitHub now reports BLOCKED (not DRAFT) for drafts, so read isDraft too.
  if (pr.isDraft || s === 'DRAFT')
    return { label: 'draft', tone: 'muted', icon: 'draft', help: 'This pull request is a draft. Mark it ready for review to merge it.' + reported };
  if (s === 'DIRTY' || pr.mergeable === 'CONFLICTING')
    return { label: 'conflicts', tone: 'bad', icon: 'alert', help: 'The branch has merge conflicts with the base branch. Resolve them to merge.' + reported };
  if (s === 'BEHIND')
    return { label: 'out of date', tone: 'warn', icon: 'branch', help: 'The base branch has new commits. Update the branch to merge.' + reported };
  if (s === 'BLOCKED') {
    const rollup = pr.statusCheckRollup?.state;
    const reasons: { label: string; tone: Tone; icon: IconId; why: string }[] = [];
    if (pr.reviewDecision === 'CHANGES_REQUESTED') reasons.push({ label: 'changes requested', tone: 'bad', icon: 'x', why: 'A reviewer requested changes.' });
    if (rollup && FAILING_ROLLUP.has(rollup)) reasons.push({ label: 'checks failing', tone: 'bad', icon: 'x', why: 'Some checks fail.' });
    if (pr.reviewDecision === 'REVIEW_REQUIRED') reasons.push({ label: 'needs review', tone: 'warn', icon: 'eye', why: 'The pull request needs an approving review.' });
    if (rollup && PENDING_ROLLUP.has(rollup)) reasons.push({ label: 'checks running', tone: 'warn', icon: 'clock', why: 'Checks are still running.' });
    const first = reasons[0];
    if (!first)
      return { label: 'blocked', tone: 'warn', icon: 'alert', help: 'A branch protection rule blocks the merge, for example required checks that have not started, unresolved conversations or signed commits.' + reported };
    return { label: first.label, tone: first.tone, icon: first.icon, help: reasons.map((r) => r.why).join(' ') + ' Branch protection blocks the merge until this changes.' + reported };
  }
  if (s === 'UNSTABLE')
    return { label: 'ready', tone: 'warn', icon: 'alert', help: 'You can merge. Some checks that are not required fail.' + reported };
  if (s === 'CLEAN' || s === 'HAS_HOOKS')
    return { label: 'ready', tone: 'good', icon: 'check', help: 'You can merge. All requirements pass.' + reported };
  if (s === 'UNKNOWN')
    return { label: 'checking', tone: 'muted', icon: 'clock', help: 'GitHub has not calculated the merge state yet. It does this in the background after a push or a change to the base branch. Refresh in a minute.' };
  return { label: titleCase(s).toLowerCase(), tone: 'neutral', help: `GitHub reports ${s.toLowerCase()}.` };
}

export const mergeFields: FieldDef[] = [
  defineField<AutoMerge>({
    id: 'autoMerge', label: 'Auto-merge', description: 'Whether auto-merge is on, with the merge method. Hover for who enabled it and when.',
    fragment: 'autoMergeRequest { enabledAt enabledBy { login } mergeMethod }', width: 120,
    get: (pr) => pr.autoMergeRequest,
    sortValue: (v) => (v === undefined ? undefined : v ? 1 : 0),
    groupValue: (v) => (v ? 'Auto-merge on' : 'Auto-merge off'),
    display: (v) => {
      if (v === undefined) return EMPTY;
      if (!v) return { text: 'off', tone: 'muted' };
      const who = v.enabledBy?.login ?? 'someone';
      return {
        text: `on · ${v.mergeMethod.toLowerCase()}`,
        tone: 'good', icon: 'merge', pill: true,
        title: `Enabled by ${who}${v.enabledAt ? ' on ' + shortDate(v.enabledAt) : ''} (${v.mergeMethod.toLowerCase()})`,
      };
    },
    requires: ['Pull requests: read'],
  }),
  defineField<MergeStatus | undefined>({
    id: 'mergeState', label: 'Merge state',
    description: 'Whether the pull request can merge, and if not, why: conflicts, out of date, checks running or failing, needs review, draft.',
    fragment: 'mergeStateStatus mergeable isDraft reviewDecision statusCheckRollup { state }', width: 140,
    get: mergeStatus,
    groupValue: (v) => (v ? v.label[0]!.toUpperCase() + v.label.slice(1) : 'Unknown'),
    display: (v) => (v ? { text: v.label, tone: v.tone, icon: v.icon, title: v.help, pill: true } : EMPTY),
    requires: ['Pull requests: read'],
  }),
  defineField<string | undefined>({
    id: 'mergeable', label: 'Mergeable', description: 'Whether the branch merges without conflicts: mergeable, conflicting or unknown.',
    fragment: 'mergeable', width: 110,
    get: (pr) => pr.mergeable,
    groupValue: (v) => (v ? titleCase(v) : 'Unknown'),
    display: (v) => (v ? { text: v.toLowerCase(), tone: v === 'MERGEABLE' ? 'good' : v === 'CONFLICTING' ? 'bad' : 'muted', icon: v === 'CONFLICTING' ? 'alert' : undefined, pill: true } : EMPTY),
    requires: ['Pull requests: read'],
  }),
  defineField<{ inQueue: boolean; position?: number; state?: string } | undefined>({
    id: 'mergeQueue', label: 'Merge queue', description: 'Position and state in the merge queue, if the pull request is in one.',
    fragment: 'isInMergeQueue mergeQueueEntry { position state }', width: 120,
    get: (pr) => (pr.isInMergeQueue === undefined ? undefined : { inQueue: pr.isInMergeQueue, position: pr.mergeQueueEntry?.position, state: pr.mergeQueueEntry?.state }),
    sortValue: (v) => (v?.inQueue ? v.position ?? 0 : undefined),
    groupValue: (v) => (v?.inQueue ? 'In merge queue' : 'Not queued'),
    display: (v) => {
      if (!v) return EMPTY;
      if (!v.inQueue) return { text: '', tone: 'muted' };
      const state = v.state ? titleCase(v.state).toLowerCase() : 'queued';
      return { text: `#${v.position ?? '?'} · ${state}`, icon: 'queue', tone: v.state === 'UNMERGEABLE' ? 'bad' : 'neutral', pill: true };
    },
    requires: ['Pull requests: read'],
  }),
];
