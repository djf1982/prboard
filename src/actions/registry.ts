import type { ActionChoice, ActionDef } from './types';
import type { PullRequestNode } from '../github/types';

const WRITE = ['Pull requests: write'] as const;
const label = (pr: PullRequestNode) => `${pr.repository?.nameWithOwner ?? ''}#${pr.number ?? ''}`.replace(/^#/, '');

function mergeMethods(pr: PullRequestNode): ActionChoice[] {
  const r = pr.repository;
  const out: ActionChoice[] = [];
  if (r?.squashMergeAllowed !== false) out.push({ id: 'SQUASH', label: 'Squash' });
  if (r?.mergeCommitAllowed !== false) out.push({ id: 'MERGE', label: 'Merge commit' });
  if (r?.rebaseMergeAllowed !== false) out.push({ id: 'REBASE', label: 'Rebase' });
  return out;
}

const open = (pr: PullRequestNode) => pr.state === undefined || pr.state === 'OPEN';

export const ACTIONS: ActionDef[] = [
  {
    id: 'enableAutoMerge', label: 'Enable auto-merge',
    description: 'GitHub merges the pull request when all requirements pass.',
    fragment: 'viewerCanEnableAutoMerge autoMergeRequest { mergeMethod } repository { squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed }',
    available: (pr) => open(pr) && !!pr.viewerCanEnableAutoMerge && !pr.autoMergeRequest,
    choices: mergeMethods,
    confirm: (pr, m) => `Enable auto-merge (${(m ?? 'SQUASH').toLowerCase()}) on ${label(pr)}? GitHub will merge it as soon as all requirements pass.`,
    mutation: (pr, m) => ({
      query: 'mutation($id: ID!, $method: PullRequestMergeMethod, $oid: GitObjectID) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method, expectedHeadOid: $oid }) { clientMutationId } }',
      variables: { id: pr.id, method: m ?? 'SQUASH', oid: pr.headRefOid ?? null },
    }),
    requires: [...WRITE],
  },
  {
    id: 'disableAutoMerge', label: 'Disable auto-merge',
    description: 'Turns auto-merge off.',
    fragment: 'viewerCanDisableAutoMerge autoMergeRequest { mergeMethod }',
    available: (pr) => !!pr.viewerCanDisableAutoMerge && !!pr.autoMergeRequest,
    mutation: (pr) => ({
      query: 'mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }',
      variables: { id: pr.id },
    }),
    requires: [...WRITE],
  },
  {
    id: 'markReady', label: 'Mark ready for review',
    description: 'Moves a draft out of draft state.',
    fragment: 'isDraft viewerCanUpdate',
    available: (pr) => open(pr) && !!pr.isDraft && !!pr.viewerCanUpdate,
    mutation: (pr) => ({
      query: 'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }',
      variables: { id: pr.id },
    }),
    requires: [...WRITE],
  },
  {
    id: 'convertToDraft', label: 'Convert to draft',
    description: 'Moves the pull request back to draft.',
    fragment: 'isDraft viewerCanUpdate',
    available: (pr) => open(pr) && pr.isDraft === false && !!pr.viewerCanUpdate,
    mutation: (pr) => ({
      query: 'mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }',
      variables: { id: pr.id },
    }),
    requires: [...WRITE],
  },
  {
    id: 'updateBranch', label: 'Update branch',
    description: 'Brings the head branch up to date with the base branch.',
    fragment: 'viewerCanUpdateBranch',
    available: (pr) => open(pr) && !!pr.viewerCanUpdateBranch,
    choices: () => [{ id: 'MERGE', label: 'Merge' }, { id: 'REBASE', label: 'Rebase' }],
    confirm: (pr, m) => `Update the branch of ${label(pr)} by ${m === 'REBASE' ? 'rebasing (this rewrites its commits)' : 'merging the base branch in'}?`,
    mutation: (pr, m) => ({
      query: 'mutation($id: ID!, $method: PullRequestBranchUpdateMethod, $oid: GitObjectID) { updatePullRequestBranch(input: { pullRequestId: $id, updateMethod: $method, expectedHeadOid: $oid }) { clientMutationId } }',
      variables: { id: pr.id, method: m ?? 'MERGE', oid: pr.headRefOid ?? null },
    }),
    requires: ['Contents: write'],
  },
  {
    id: 'enqueue', label: 'Add to merge queue',
    description: 'Adds the pull request to the merge queue of its base branch.',
    // GitHub has no viewerCanEnqueue field. viewerCanUpdate is the closest signal; a failed mutation shows its error.
    fragment: 'isMergeQueueEnabled isInMergeQueue isDraft viewerCanUpdate',
    available: (pr) => open(pr) && !!pr.isMergeQueueEnabled && pr.isInMergeQueue === false && pr.isDraft !== true && !!pr.viewerCanUpdate,
    confirm: (pr) => `Add ${label(pr)} to the merge queue? It will merge if its queue checks pass.`,
    mutation: (pr) => ({
      query: 'mutation($id: ID!, $oid: GitObjectID) { enqueuePullRequest(input: { pullRequestId: $id, expectedHeadOid: $oid }) { clientMutationId } }',
      variables: { id: pr.id, oid: pr.headRefOid ?? null },
    }),
    requires: [...WRITE],
  },
  {
    id: 'dequeue', label: 'Remove from merge queue',
    description: 'Takes the pull request out of the merge queue.',
    fragment: 'isInMergeQueue',
    available: (pr) => !!pr.isInMergeQueue,
    mutation: (pr) => ({
      query: 'mutation($id: ID!) { dequeuePullRequest(input: { id: $id }) { clientMutationId } }',
      variables: { id: pr.id },
    }),
    requires: [...WRITE],
  },
  {
    id: 'approve', label: 'Approve',
    description: 'Submits an approving review with no comment.',
    fragment: 'viewerDidAuthor isDraft',
    available: (pr) => open(pr) && pr.viewerDidAuthor === false && pr.isDraft !== true,
    confirm: (pr) => `Approve ${label(pr)}?`,
    mutation: (pr) => ({
      query: 'mutation($id: ID!, $oid: GitObjectID) { addPullRequestReview(input: { pullRequestId: $id, event: APPROVE, commitOID: $oid }) { clientMutationId } }',
      variables: { id: pr.id, oid: pr.headRefOid ?? null },
    }),
    requires: [...WRITE],
  },
];

/** Every action needs these. headRefOid guards against acting on a commit the user did not see. */
export const ACTIONS_BASE_FRAGMENT = 'state headRefOid';

export const ACTIONS_FRAGMENTS: string[] = [ACTIONS_BASE_FRAGMENT, ...ACTIONS.map((a) => a.fragment)];

export function availableActions(pr: PullRequestNode): ActionDef[] {
  return ACTIONS.filter((a) => a.available(pr));
}
