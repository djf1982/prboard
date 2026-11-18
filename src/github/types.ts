/** A PullRequest node as returned by the built query. Every field is optional,
 *  because the query only selects the fields that the active views use. */
export interface PullRequestNode {
  id: string;
  url: string;
  number?: number;
  title?: string;
  isDraft?: boolean;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  createdAt?: string;
  updatedAt?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  headRefOid?: string;
  repository?: {
    nameWithOwner: string;
    url?: string;
    mergeCommitAllowed?: boolean;
    squashMergeAllowed?: boolean;
    rebaseMergeAllowed?: boolean;
  };
  author?: { login: string; url?: string } | null;
  labels?: { nodes: { name: string; color?: string }[] };
  assignees?: { nodes: { login: string }[] };
  milestone?: { title: string; url?: string } | null;
  baseRefName?: string;
  headRefName?: string;
  comments?: { totalCount: number };
  autoMergeRequest?: {
    enabledAt: string | null;
    enabledBy: { login: string } | null;
    mergeMethod: 'MERGE' | 'SQUASH' | 'REBASE';
  } | null;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  reviewRequests?: {
    nodes: { requestedReviewer: { __typename: string; login?: string; slug?: string; name?: string } | null }[];
  };
  latestReviews?: { nodes: { state: string; author: { login: string } | null }[] };
  statusCheckRollup?: {
    state: string;
    contexts: {
      totalCount: number;
      checkRunCountsByState: { state: string; count: number }[] | null;
      statusContextCountsByState: { state: string; count: number }[] | null;
      nodes: CheckContext[];
    };
  } | null;
  mergeStateStatus?: string;
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  mergeQueueEntry?: { id?: string; position: number; state: string } | null;
  reviewThreads?: { totalCount: number; nodes: { isResolved: boolean }[] };
  viewerCanEnableAutoMerge?: boolean;
  viewerCanDisableAutoMerge?: boolean;
  viewerCanUpdate?: boolean;
  viewerCanUpdateBranch?: boolean;
  viewerDidAuthor?: boolean;
}

export type CheckContext =
  | { __typename: 'CheckRun'; name: string; status: string; conclusion: string | null; detailsUrl?: string | null }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl?: string | null };

export interface RateLimit {
  cost: number;
  remaining: number;
  limit: number;
  resetAt: string;
}
