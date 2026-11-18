import { describe, expect, it } from 'vitest';
import { buildSearchQuery, ensurePrQualifier, mergeFragments } from '../src/github/queryBuilder';
import { topLevelKeys } from '../src/github/fragments';
import { configFragments, fragmentsFor } from '../src/views/columns';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { ViewConfig } from '../src/config/schema';
import { FIELDS } from '../src/fields/registry';

const view = (columns: ViewConfig['columns'], extra: Partial<ViewConfig> = {}): ViewConfig => ({ name: 'v', query: 'is:pr', sort: [], columns, ...extra });

describe('mergeFragments', () => {
  it('always includes id and url, and removes duplicates', () => {
    const s = mergeFragments(['title', 'title', 'createdAt', ' createdAt ']);
    expect(s).toBe('id url title createdAt');
  });

  it('treats whitespace differences as the same fragment', () => {
    expect(mergeFragments(['labels(first: 20) { nodes { name } }', 'labels(first:20){nodes{name}}'])).toBe('id url labels(first:20){nodes{name}}');
  });
});

describe('only-used fields', () => {
  it('queries only the fields in use', () => {
    const frags = fragmentsFor([view(['title', 'checks'])]);
    expect(frags).toEqual([FIELDS.get('title')!.fragment, FIELDS.get('checks')!.fragment]);
  });

  it('skips hidden columns', () => {
    expect(fragmentsFor([view(['title', { id: 'checks', hidden: true }])])).toEqual([FIELDS.get('title')!.fragment]);
  });

  it('includes fields used by sort and groupBy', () => {
    const frags = fragmentsFor([view(['title'], { groupBy: 'repository', sort: [{ field: 'updatedAt', dir: 'desc' }] })]);
    expect(frags).toContain(FIELDS.get('repository')!.fragment);
    expect(frags).toContain(FIELDS.get('updatedAt')!.fragment);
  });

  it('includes the source field of computed columns', () => {
    const frags = fragmentsFor([view([{ id: 'area', from: 'labels', prefix: 'area/' }])]);
    expect(frags).toEqual([FIELDS.get('labels')!.fragment]);
  });

  it('includes action fields only when the actions column is shown', () => {
    expect(fragmentsFor([view(['title'])]).join(' ')).not.toContain('viewerCanEnableAutoMerge');
    expect(fragmentsFor([view(['title', 'actions'])]).join(' ')).toContain('viewerCanEnableAutoMerge');
    expect(fragmentsFor([view(['title', 'actions'])]).join(' ')).toContain('headRefOid');
  });

  it('merges across all views', () => {
    const q = buildSearchQuery(configFragments(DEFAULT_CONFIG));
    expect(q).toContain('autoMergeRequest');
    expect(q).toContain('author');
    expect(q).not.toContain('milestone');
    expect(q).toContain('rateLimit { cost remaining limit resetAt }');
    expect(q).toContain('search(query: $q, type: ISSUE, first: $first, after: $after)');
  });
});

describe('topLevelKeys', () => {
  it('reads names and aliases at the top level only', () => {
    expect(topLevelKeys('a b: c(x: 1) { d e } f { g }')).toEqual(['a', 'b', 'f']);
    expect(topLevelKeys(FIELDS.get('checks')!.fragment)).toEqual(['statusCheckRollup']);
    expect(topLevelKeys(FIELDS.get('mergeQueue')!.fragment)).toEqual(['isInMergeQueue', 'mergeQueueEntry']);
  });
});

describe('ensurePrQualifier', () => {
  it('adds is:pr when no type is given', () => {
    expect(ensurePrQualifier('author:@me')).toBe('author:@me is:pr');
    expect(ensurePrQualifier('is:pr author:@me')).toBe('is:pr author:@me');
    expect(ensurePrQualifier('type:pr review-requested:@me')).toBe('type:pr review-requested:@me');
  });
});
