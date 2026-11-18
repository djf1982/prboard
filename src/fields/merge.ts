import { defineField, EMPTY, type FieldDef, type Tone } from './types';
import { shortDate, titleCase } from './format';
import type { PullRequestNode } from '../github/types';

type AutoMerge = PullRequestNode['autoMergeRequest'];

const MERGE_STATE_TONE: Record<string, Tone> = {
  CLEAN: 'good', HAS_HOOKS: 'good', UNSTABLE: 'warn', BEHIND: 'warn', BLOCKED: 'warn', DIRTY: 'bad', DRAFT: 'muted', UNKNOWN: 'muted',
};
const MERGE_STATE_HELP: Record<string, string> = {
  CLEAN: 'Mergeable, and all requirements pass.',
  HAS_HOOKS: 'Mergeable with passing commit status and pre-receive hooks.',
  UNSTABLE: 'Mergeable, but some non-required checks fail.',
  BEHIND: 'The head branch is out of date with the base.',
  BLOCKED: 'Blocked by branch protection (reviews or required checks).',
  DIRTY: 'Merge conflicts, or the merge commit cannot be created.',
  DRAFT: 'Blocked because the pull request is a draft.',
  UNKNOWN: 'GitHub is still computing the state.',
};

export const mergeFields: FieldDef[] = [
  defineField<AutoMerge>({
    id: 'autoMerge', label: 'Auto-merge', description: 'Whether auto-merge is on, with the merge method. Hover for who enabled it and when.',
    fragment: 'autoMergeRequest { enabledAt enabledBy { login } mergeMethod }', width: 136,
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
  defineField<string | undefined>({
    id: 'mergeState', label: 'Merge state', description: 'mergeStateStatus: clean, blocked, behind, dirty, unstable, draft, …',
    // GitHub now reports BLOCKED (not DRAFT) for drafts, so read isDraft too.
    fragment: 'mergeStateStatus isDraft', width: 110,
    get: (pr) => (pr.isDraft && pr.mergeStateStatus ? 'DRAFT' : pr.mergeStateStatus),
    groupValue: (v) => (v ? titleCase(v) : 'Unknown'),
    display: (v, pr) => {
      if (!v) return EMPTY;
      const title = v === 'DRAFT' && pr.mergeStateStatus !== 'DRAFT' ? `${MERGE_STATE_HELP.DRAFT} (GitHub reports ${pr.mergeStateStatus?.toLowerCase()}.)` : MERGE_STATE_HELP[v];
      return { text: titleCase(v).toLowerCase(), tone: MERGE_STATE_TONE[v] ?? 'neutral', title, pill: true };
    },
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
