import { normaliseFragment } from './fragments';
import { RATE_LIMIT_SELECTION } from './client';

/** Always selected: the id deduplicates PRs across views, and every row links to its url. */
export const BASE_FRAGMENTS = ['id', 'url'];

/**
 * Merges field fragments into one PullRequest selection. Identical fragments
 * are kept once. GraphQL merges the same field with the same arguments, so
 * two fields can both select, for example, autoMergeRequest { ... }.
 */
export function mergeFragments(fragments: Iterable<string>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of [...BASE_FRAGMENTS, ...fragments]) {
    const n = normaliseFragment(f);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.join(' ');
}

export function buildSearchQuery(fragments: Iterable<string>): string {
  const selection = mergeFragments(fragments);
  return `query PrboardSearch($q: String!, $first: Int!, $after: String) {
  ${RATE_LIMIT_SELECTION}
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${selection} } }
  }
}`;
}

/** Adds is:pr when the query has no type qualifier, so issues do not use up the 1,000-result limit. */
export function ensurePrQualifier(q: string): string {
  return /(^|\s)(is|type):(pr|pull-request)(\s|$)/i.test(q) ? q.trim() : `${q.trim()} is:pr`;
}
