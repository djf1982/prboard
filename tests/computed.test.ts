import { describe, expect, it } from 'vitest';
import { buildLink, checkLinkTemplate, checkRegex, firstMatch, prefixCell, regexCell, MAX_INPUT_LENGTH } from '../src/config/computed';
import { computeCellSync } from '../src/views/computeColumns';
import { runRegexJobs } from '../src/config/regexRunner';
import prs from './fixtures/prs.json';
import type { PullRequestNode } from '../src/github/types';
import { safeHref } from '../src/ui/safeHref';

const [auto] = prs as unknown as PullRequestNode[];

describe('checkRegex', () => {
  it.each(['ACME-\\d+', '(ACME-\\d+)', '^\\[([A-Z]+)\\]', '[a-z]+/[a-z]+', '(?:feat|fix)\\(([a-z]+)\\)', 'x{2,5}', '(?<ticket>[A-Z]+-\\d+)'])('allows %s', (p) => {
    expect(checkRegex(p)).toBeNull();
  });

  it.each([
    ['(a+)+$', /nested/],
    ['(a*)*b', /nested/],
    ['(?:\\w+\\s?)*$', /nested/],
    ['(a|aa)+$', /\|/],
    ['(.*a){20}', /nested/],
    ['(a)\\1', /backreference/],
    ['(?<n>a)\\k<n>', /backreference/],
    ['a(?=b)', /lookahead/],
    ['(?<!a)b', /lookahead/],
    ['a{1,1000}', /repeat/],
    ['x'.repeat(201), /longer/],
    ['(', /not valid/],
  ])('rejects %s', (p, msg) => {
    expect(checkRegex(p)).toMatch(msg);
  });
});

describe('regex execution', () => {
  it('caps input length', () => {
    const long = 'a'.repeat(MAX_INPUT_LENGTH) + 'ACME-1';
    expect(firstMatch('ACME-\\d+', long)).toBeNull();
  });

  it('runs jobs (sync fallback outside the browser)', async () => {
    expect(await runRegexJobs([{ pattern: '(\\d+)', inputs: ['a1', 'b'] }])).toEqual([[['1', '1'], null]]);
  });
});

describe('links', () => {
  it('rejects javascript: and other schemes', () => {
    expect(checkLinkTemplate('javascript:alert(1)')).toMatch(/https/);
    expect(checkLinkTemplate('JavaScript:alert(1)//https://')).toMatch(/https/);
    expect(checkLinkTemplate('http://example.com/$1')).toMatch(/https/);
    expect(checkLinkTemplate('data:text/html,hi')).toMatch(/https/);
  });

  it('rejects templates where the match picks the host', () => {
    expect(checkLinkTemplate('https://$1/x')).toMatch(/host/);
    expect(checkLinkTemplate('https://example.com$1')).toMatch(/host/);
    expect(checkLinkTemplate('https://example.com/issue/$1')).toBeNull();
  });

  it('encodes substituted values', () => {
    expect(buildLink('https://x.test/i/$1', ['a', '../../evil?x=1#y'])).toBe('https://x.test/i/..%2F..%2Fevil%3Fx%3D1%23y');
    expect(buildLink('javascript:$1', ['alert(1)'])).toBeUndefined();
  });

  it('safeHref keeps only https', () => {
    expect(safeHref('https://github.com/x')).toBe('https://github.com/x');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref(' javascript:alert(1)')).toBeUndefined();
    expect(safeHref('http://github.com')).toBeUndefined();
    expect(safeHref('data:text/html,x')).toBeUndefined();
    expect(safeHref('/relative')).toBeUndefined();
  });
});

describe('computed cells', () => {
  it('regex: first match', () => {
    expect(computeCellSync({ id: 't', from: 'title', regex: 'ACME-\\d+' }, auto!)).toEqual({ text: 'ACME-1234' });
  });
  it('regex with link', () => {
    expect(computeCellSync({ id: 't', from: 'title', regex: '(ACME-\\d+)', link: 'https://linear.app/acme/issue/$1' }, auto!)).toEqual({ text: 'ACME-1234', href: 'https://linear.app/acme/issue/ACME-1234' });
  });
  it('regex: empty when no match', () => {
    expect(regexCell({ id: 't', from: 'title', regex: 'x' }, null).text).toBe('');
  });
  it('prefix: strips prefix from matching labels', () => {
    expect(computeCellSync({ id: 'a', from: 'labels', prefix: 'area/' }, auto!).text).toBe('api, ui');
    expect(prefixCell('area/', { text: '', items: ['area/', 'bug'] }).text).toBe('');
  });
});
