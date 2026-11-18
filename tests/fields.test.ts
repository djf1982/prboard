import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import prs from './fixtures/prs.json';
import type { PullRequestNode } from '../src/github/types';
import { ALL_FIELDS, FIELDS } from '../src/fields/registry';
import { topLevelKeys } from '../src/github/fragments';
import { sizeBucket } from '../src/fields/core';

const [auto, failing, draft] = prs as unknown as PullRequestNode[];
const f = (id: string) => FIELDS.get(id)!;
const show = (id: string, pr: PullRequestNode) => f(id).display(f(id).get(pr), pr);

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-18T12:00:00Z')); });
afterAll(() => vi.useRealTimers());

describe('registry', () => {
  it('has the v1 fields', () => {
    for (const id of ['number', 'title', 'url', 'repository', 'author', 'isDraft', 'state', 'createdAt', 'updatedAt', 'age', 'labels', 'assignees', 'milestone', 'baseRef', 'headRef', 'additions', 'deletions', 'changedFiles', 'size', 'comments', 'autoMerge', 'reviewDecision', 'pendingReviewers', 'latestReviews', 'checks', 'mergeState', 'mergeable', 'mergeQueue', 'unresolvedThreads'])
      expect(FIELDS.has(id), id).toBe(true);
  });

  it.each(ALL_FIELDS.map((x) => [x.id, x] as const))('%s is well formed and works on every fixture', (_id, field) => {
    expect(field.label).toBeTruthy();
    expect(field.description.length).toBeGreaterThan(5);
    expect(topLevelKeys(field.fragment).length).toBeGreaterThan(0);
    for (const pr of [auto!, failing!, draft!]) {
      const v = field.get(pr);
      const cell = field.display(v, pr);
      expect(typeof cell.text).toBe('string');
      if (cell.href) expect(cell.href.startsWith('https://')).toBe(true);
      if (field.sortValue) expect(['string', 'number', 'undefined']).toContain(typeof field.sortValue(v));
      if (field.groupValue) expect(typeof field.groupValue(v)).toBe('string');
    }
  });

  it('handles fields missing from the response', () => {
    const bare: PullRequestNode = { id: 'x', url: 'https://github.com/a/b/pull/1' };
    for (const field of ALL_FIELDS) expect(() => field.display(field.get(bare), bare)).not.toThrow();
  });
});

describe('differentiator fields', () => {
  it('autoMerge', () => {
    const on = show('autoMerge', auto!);
    expect(on.text).toBe('on · squash');
    expect(on.tone).toBe('good');
    expect(on.title).toContain('alice');
    expect(on.title).toContain('2026-11-17');
    expect(show('autoMerge', failing!).text).toBe('off');
    expect(f('autoMerge').sortValue!(f('autoMerge').get(auto!))).toBe(1);
    expect(f('autoMerge').groupValue!(null)).toBe('Auto-merge off');
  });

  it('checks: counts, failing names on hover, tones', () => {
    const ok = show('checks', auto!);
    expect(ok.text).toBe('3/3');
    expect(ok.tone).toBe('good');
    const bad = show('checks', failing!);
    expect(bad.text).toBe('1/4');
    expect(bad.tone).toBe('bad');
    expect(bad.title).toContain('Failing: test, ci/legacy');
    expect(bad.title).toContain('Pending: e2e');
    expect(bad.href).toBe('https://github.com/example-org/gadgets/pull/7/checks');
    expect(show('checks', draft!).text).toBe('none');
    expect(f('checks').cost).toBe('high');
    const sv = f('checks').sortValue!;
    expect(sv(f('checks').get(failing!)) as number).toBeLessThan(sv(f('checks').get(auto!)) as number);
  });

  it('reviewDecision', () => {
    expect(show('reviewDecision', auto!)).toMatchObject({ text: 'review required', tone: 'warn' });
    expect(show('reviewDecision', failing!)).toMatchObject({ text: 'changes requested', tone: 'bad' });
    expect(show('reviewDecision', draft!).text).toBe('none');
  });

  it('pendingReviewers lists users and teams', () => {
    expect(f('pendingReviewers').get(auto!)).toEqual(['bob', 'team/backend']);
    expect(show('pendingReviewers', auto!).chips).toHaveLength(2);
  });

  it('latestReviews skips dismissed reviews', () => {
    const chips = show('latestReviews', failing!).chips!;
    expect(chips.map((c) => [c.text, c.tone])).toEqual([['dave', 'bad'], ['erin', 'good']]);
  });

  it('mergeState and mergeable', () => {
    expect(show('mergeState', auto!)).toMatchObject({ text: 'blocked', tone: 'warn' });
    expect(show('mergeState', failing!)).toMatchObject({ text: 'dirty', tone: 'bad' });
    expect(show('mergeable', failing!)).toMatchObject({ text: 'conflicting', tone: 'bad' });
  });

  it('mergeQueue', () => {
    expect(show('mergeQueue', failing!).text).toBe('#2 · awaiting checks');
    expect(show('mergeQueue', auto!).text).toBe('');
  });

  it('unresolvedThreads caps at 100 and says so', () => {
    expect(show('unresolvedThreads', auto!).text).toBe('2');
    const capped = show('unresolvedThreads', failing!);
    expect(capped.text).toBe('50+');
    expect(capped.title).toContain('first 100 of 150');
  });
});

describe('core fields', () => {
  it('derived age and size', () => {
    expect(show('age', auto!).text).toBe('8d');
    expect(show('age', draft!).text).toBe('3h');
    expect(sizeBucket(5)).toBe('XS');
    expect(sizeBucket(150)).toBe('M');
    expect(show('size', failing!)).toMatchObject({ text: 'XL', tone: 'warn' });
  });

  it('title is plain text and links to the PR', () => {
    expect(show('title', auto!)).toMatchObject({ text: 'feat: add widget ACME-1234', href: auto!.url });
  });

  it('author shows ghost for deleted users', () => {
    expect(show('author', failing!).text).toBe('ghost');
  });

  it('isDraft groups', () => {
    expect(f('isDraft').groupValue!(f('isDraft').get(draft!))).toBe('Draft');
  });
});
