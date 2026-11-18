import type { Client, GraphQLErrorItem } from './client';
import type { PullRequestNode, RateLimit } from './types';
import { buildSearchQuery, ensurePrQualifier } from './queryBuilder';

/** GitHub search never returns more than 1,000 results for one query. */
export const SEARCH_CAP = 1000;

export interface SearchResult {
  nodes: PullRequestNode[];
  /** issueCount as GitHub reports it (can be more than 1,000). */
  total: number;
  /** True when GitHub has more results than we could fetch. */
  truncated: boolean;
  /** Per node id, the response keys GitHub refused (usually a token permission). */
  denied: Map<string, Set<string>>;
  /** Errors that are not tied to one node field. */
  errors: string[];
  rateLimit?: RateLimit;
  cost: number;
}

interface SearchResponse {
  rateLimit?: RateLimit;
  search: {
    issueCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: (PullRequestNode | Record<string, never> | null)[];
  };
}

export async function searchPullRequests(
  client: Client,
  query: string,
  fragments: Iterable<string>,
  opts: { pageSize?: number; maxResults?: number; signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const gql = buildSearchQuery(fragments);
  const q = ensurePrQualifier(query);
  const pageSize = Math.min(100, opts.pageSize ?? 100);
  const max = Math.min(SEARCH_CAP, opts.maxResults ?? SEARCH_CAP);
  const nodes: PullRequestNode[] = [];
  const denied = new Map<string, Set<string>>();
  const errors: string[] = [];
  let after: string | null = null;
  let total = 0;
  let hasNext = true;
  let rateLimit: RateLimit | undefined;
  let cost = 0;
  let seen = 0; // every node returned, including non-PR nodes

  while (hasNext && seen < max) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res: Awaited<ReturnType<typeof client.query<SearchResponse>>> = await client.query<SearchResponse>(gql, { q, first: Math.min(pageSize, max - seen), after });
    if (!res.data?.search) throw new Error(res.errors.map((e) => e.message).join('; ') || 'Empty search response');
    const { search } = res.data;
    if (res.data.rateLimit) { rateLimit = res.data.rateLimit; cost += res.data.rateLimit.cost; }
    total = search.issueCount;
    const offset = nodes.length;
    seen += search.nodes.length;
    search.nodes.forEach((n) => { if (n && 'id' in n && n.id) nodes.push(n as PullRequestNode); });
    collectErrors(res.errors, search.nodes, offset, denied, errors);
    hasNext = search.pageInfo.hasNextPage;
    after = search.pageInfo.endCursor;
  }
  return { nodes, total, truncated: total > seen, denied, errors, rateLimit, cost };
}

/** Maps errors with a path such as ["search","nodes",3,"autoMergeRequest"] to node + key. */
function collectErrors(
  errs: GraphQLErrorItem[],
  pageNodes: SearchResponse['search']['nodes'],
  _offset: number,
  denied: Map<string, Set<string>>,
  other: string[],
) {
  for (const e of errs) {
    const p = e.path ?? [];
    const idx = p[2];
    const key = p[3];
    if (p[0] === 'search' && p[1] === 'nodes' && typeof idx === 'number' && typeof key === 'string') {
      const node = pageNodes[idx];
      if (node && 'id' in node && node.id) {
        const set = denied.get(node.id) ?? new Set<string>();
        set.add(key);
        denied.set(node.id, set);
        continue;
      }
    }
    if (!other.includes(e.message)) other.push(e.message);
  }
}
