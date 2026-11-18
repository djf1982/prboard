import { describe, expect, it, vi } from 'vitest';
import { createClient, normaliseApiUrl, scrubToken, GitHubError, type Client } from '../src/github/client';
import { searchPullRequests } from '../src/github/search';
import { parseRepoRef } from '../src/share/repo';
import { encodeConfigHash, decodeConfigHash } from '../src/share/url';
import { DEFAULT_CONFIG } from '../src/config/defaults';

const TOKEN = 'github_pat_11AAAAAAAAAAAAAAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('token safety', () => {
  it('scrubs the token and token-like strings', () => {
    expect(scrubToken(`bad ${TOKEN} here`, TOKEN)).toBe('bad [token] here');
    expect(scrubToken('ghp_abcdefghijklmnopqrstuvwxyz0123456789', null)).toBe('[token]');
  });

  it('does not put the token in error messages', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: `token ${TOKEN} bad` }), { status: 500 }));
    const client = createClient('https://api.github.com/graphql', TOKEN, fetchImpl as unknown as typeof fetch);
    const err = await client.query('{x}').catch((e: Error) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('sends the token only in the Authorization header, with credentials omitted', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: { ok: 1 } })));
    await createClient('https://api.github.com/graphql', TOKEN, fetchImpl as unknown as typeof fetch).query('{x}', { a: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/graphql');
    expect((init.headers as Record<string, string>).Authorization).toBe(`bearer ${TOKEN}`);
    expect(init.credentials).toBe('omit');
    expect(String(init.body)).not.toContain(TOKEN);
  });

  it('maps 401 to an auth error', async () => {
    const client = createClient('https://api.github.com/graphql', TOKEN, (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch);
    await expect(client.query('{x}')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('only allows https API URLs', () => {
    expect(normaliseApiUrl('https://ghe.example.com/api/graphql')).toBe('https://ghe.example.com/api/graphql');
    expect(() => normaliseApiUrl('http://ghe.example.com/api/graphql')).toThrow();
  });
});

function fakeClient(pages: unknown[]): Client & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    apiUrl: 'x',
    calls,
    async query(_q: string, vars: Record<string, unknown> = {}) {
      calls.push(vars);
      return pages.shift() as never;
    },
  };
}

const page = (ids: string[], hasNextPage: boolean, issueCount: number, errors: unknown[] = []) => ({
  data: {
    rateLimit: { cost: 1, remaining: 4990, limit: 5000, resetAt: '2026-11-18T13:00:00Z' },
    search: { issueCount, pageInfo: { hasNextPage, endCursor: ids.at(-1) ?? null }, nodes: ids.map((id) => (id === 'issue' ? {} : { id, url: `https://github.com/a/b/pull/${id}` })) },
  },
  errors,
});

describe('searchPullRequests', () => {
  it('paginates, skips non-PR nodes, and adds is:pr', async () => {
    const c = fakeClient([page(['1', 'issue'], true, 3), page(['3'], false, 3)]);
    const res = await searchPullRequests(c, 'author:@me', ['title']);
    expect(res.nodes.map((n) => n.id)).toEqual(['1', '3']);
    expect(c.calls[0]).toMatchObject({ q: 'author:@me is:pr', after: null });
    expect(c.calls[1]).toMatchObject({ after: 'issue' });
    expect(res.truncated).toBe(false);
    expect(res.cost).toBe(2);
  });

  it('stops at 1,000 and reports truncation', async () => {
    const ids = (n: number, o: number) => Array.from({ length: n }, (_, i) => String(i + o));
    const pages = Array.from({ length: 10 }, (_, p) => page(ids(100, p * 100), true, 5000));
    const c = fakeClient(pages);
    const res = await searchPullRequests(c, 'is:pr', []);
    expect(res.nodes).toHaveLength(1000);
    expect(res.total).toBe(5000);
    expect(res.truncated).toBe(true);
    expect(c.calls).toHaveLength(10);
  });

  it('maps permission errors to the node and field', async () => {
    const err = { message: 'Resource not accessible by personal access token', type: 'FORBIDDEN', path: ['search', 'nodes', 1, 'statusCheckRollup'] };
    const res = await searchPullRequests(fakeClient([page(['1', '2'], false, 2, [err, { message: 'other' }])]), 'is:pr', []);
    expect([...(res.denied.get('2') ?? [])]).toEqual(['statusCheckRollup']);
    expect(res.denied.has('1')).toBe(false);
    expect(res.errors).toEqual(['other']);
  });
});

describe('sharing', () => {
  it('round-trips a config through the URL hash', async () => {
    const hash = await encodeConfigHash(DEFAULT_CONFIG);
    expect(hash.startsWith('#config=')).toBe(true);
    expect(hash.slice('#config='.length)).not.toMatch(/[+/=]/);
    const res = await decodeConfigHash(hash);
    expect(res).toEqual({ ok: true, config: DEFAULT_CONFIG, migratedFrom: undefined });
  });

  it('rejects garbage and decompression bombs', async () => {
    expect((await decodeConfigHash('#config=!!!')).ok).toBe(false);
    const big = new TextEncoder().encode(' '.repeat(5_000_000));
    const packed = new Uint8Array(await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = '';
    for (const b of packed) bin += String.fromCharCode(b);
    const hash = '#config=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await decodeConfigHash(hash);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.message).toMatch(/too large/);
  });

  it('parses repo references', () => {
    expect(parseRepoRef('acme/web')).toEqual({ owner: 'acme', name: 'web', ref: 'HEAD', path: '.github/prboard.yml' });
    expect(parseRepoRef('acme/web@main:cfg/board.yml')).toEqual({ owner: 'acme', name: 'web', ref: 'main', path: 'cfg/board.yml' });
    expect(parseRepoRef('not a repo')).toBeNull();
  });
});
