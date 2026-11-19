import { CURRENT_VERSION, type Config } from './schema';

export const DEFAULT_CONFIG: Config = {
  version: CURRENT_VERSION,
  refreshSeconds: 120,
  views: [
    {
      name: 'My PRs',
      query: 'is:open is:pr author:@me archived:false',
      groupBy: 'repository',
      sort: [{ field: 'updatedAt', dir: 'desc' }],
      columns: ['number', 'title', 'autoMerge', 'reviewDecision', 'pendingReviewers', 'checks', 'mergeState', 'age', 'actions'],
    },
    {
      name: 'Needs my review',
      query: 'is:open is:pr review-requested:@me archived:false',
      sort: [{ field: 'createdAt', dir: 'asc' }],
      columns: ['number', 'title', 'author', 'repository', 'checks', 'size', 'age', 'actions'],
    },
  ],
};
