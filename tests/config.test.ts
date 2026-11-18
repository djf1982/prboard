import { describe, expect, it } from 'vitest';
import { parseConfigText, parseConfigValue, serialiseConfig, didYouMean, formatPath } from '../src/config/parse';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { migrate } from '../src/config/migrations';

const yaml = (views: string) => `version: 1
refreshSeconds: 120
views:
${views}`;

describe('parse', () => {
  it('accepts the default config and round-trips YAML and JSON', () => {
    for (const fmt of ['yaml', 'json'] as const) {
      const res = parseConfigText(serialiseConfig(DEFAULT_CONFIG, fmt));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.config).toEqual(DEFAULT_CONFIG);
    }
  });

  it('accepts the example from the docs', () => {
    const res = parseConfigText(yaml(`  - name: My PRs
    query: "is:open is:pr author:@me org:acme"
    groupBy: repository
    sort:
      - { field: updatedAt, dir: desc }
    columns:
      - title
      - autoMerge
      - { id: ticket, from: title, regex: "ACME-\\\\d+" }
      - { id: ticketLink, from: title, regex: "(ACME-\\\\d+)", link: "https://linear.app/acme/issue/$1" }
      - { id: area, from: labels, prefix: "area/" }
      - { id: checks, width: 120, hidden: true }
`));
    expect(res).toMatchObject({ ok: true });
  });

  it('names the path and suggests the right field', () => {
    const res = parseConfigText(yaml(`  - { name: A, query: x, columns: [title] }
  - { name: B, query: y, columns: [title, author, checks, automerge] }
`));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContainEqual({ path: 'views[1].columns[3]', message: "unknown field 'automerge' — did you mean 'autoMerge'?" });
  });

  it('reports schema errors with paths', () => {
    const res = parseConfigText(yaml(`  - { name: A, query: x, columns: [title], sort: [{ field: title, dir: up }] }`));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.path).toBe('views[0].sort[0].dir');
  });

  it('rejects unknown keys (typos) instead of ignoring them', () => {
    const res = parseConfigText(yaml(`  - { name: A, query: x, columns: [title], groupby: author }`));
    expect(res.ok).toBe(false);
  });

  it('rejects duplicate view names and columns', () => {
    const res = parseConfigText(yaml(`  - { name: A, query: x, columns: [title, title] }
  - { name: A, query: y, columns: [title] }`));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.map((e) => e.path)).toEqual(['views[0].columns[1]', 'views[1].name']);
  });

  it('checks groupBy and sort fields', () => {
    const res = parseConfigText(yaml(`  - { name: A, query: x, columns: [title], groupBy: repo, sort: [{ field: nope }] }`));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]).toEqual({ path: 'views[0].groupBy', message: "unknown field 'repo' — did you mean 'repository'?" });
      expect(res.errors[1]!.path).toBe('views[0].sort[0].field');
    }
  });

  it('allows sorting by a computed column', () => {
    expect(parseConfigText(yaml(`  - { name: A, query: x, columns: [{ id: t, from: title, regex: "x" }], sort: [{ field: t }] }`)).ok).toBe(true);
  });

  it('rejects computed columns that reuse a built-in id or mix options', () => {
    const res = parseConfigText(yaml(`  - name: A
    query: x
    columns:
      - { id: title, from: title, regex: "x" }
      - { id: a, from: title }
      - { id: b, from: title, prefix: p, link: "https://x.test/$0" }
      - { id: author, regex: "x" }`));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const paths = res.errors.map((e) => e.path);
      expect(paths).toContain('views[0].columns[1]');
      expect(paths).toContain('views[0].columns[2].link');
      expect(paths).toContain('views[0].columns[3].regex');
    }
  });

  it('rejects bad YAML and YAML alias bombs', () => {
    expect(parseConfigText('views: [').ok).toBe(false);
    const bomb = ['a: &a [x,x,x,x,x,x,x,x,x]', ...Array.from({ length: 30 }, (_, i) => `${String.fromCharCode(98 + (i % 20))}${i}: &n${i} [*${i ? 'n' + (i - 1) : 'a'},*${i ? 'n' + (i - 1) : 'a'}]`)].join('\n');
    expect(parseConfigText(bomb).ok).toBe(false);
  });

  it('rejects oversized input', () => {
    expect(parseConfigText('#'.repeat(300 * 1024)).ok).toBe(false);
  });

  it('applies defaults', () => {
    const res = parseConfigValue({ version: 1, views: [{ name: 'A', query: 'x', columns: ['title'] }] });
    expect(res.ok && res.config.refreshSeconds).toBe(120);
    expect(res.ok && res.config.views[0]!.sort).toEqual([]);
  });

  it('never treats config strings as code', () => {
    const res = parseConfigText(yaml(`  - { name: "<img src=x onerror=alert(1)>", query: "{{constructor.constructor('alert(1)')()}}", columns: [title] }`));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.config.views[0]!.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('migrations', () => {
  it('needs a version', () => {
    expect(migrate({ views: [] }).error).toMatch(/missing/);
  });
  it('refuses configs from a newer app', () => {
    const res = parseConfigValue({ version: 99, views: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.message).toMatch(/newer/);
  });
  it('passes the current version through', () => {
    expect(migrate({ version: 1 }).error).toBeUndefined();
  });
});

describe('helpers', () => {
  it('didYouMean', () => {
    expect(didYouMean('automerge', ['autoMerge', 'title'])).toBe('autoMerge');
    expect(didYouMean('tilte', ['autoMerge', 'title'])).toBe('title');
    expect(didYouMean('zzzzzz', ['autoMerge', 'title'])).toBeUndefined();
  });
  it('formatPath', () => {
    expect(formatPath(['views', 1, 'columns', 3])).toBe('views[1].columns[3]');
    expect(formatPath([])).toBe('(root)');
  });
});
