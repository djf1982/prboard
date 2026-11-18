import { describe, expect, it, vi } from 'vitest';
import {
  base64url, buildAuthorizeUrl, exchangeCode, needsRefresh, newPending, pkceChallenge, randomString, readCallback,
  refreshSession, sessionFromResponse, stripCallbackParams, installUrl, oauthEnabled, type OAuthSettings,
} from '../src/auth/oauth';
import { createClient } from '../src/github/client';

const S: OAuthSettings = { clientId: 'Iv23liabc', exchangeUrl: 'https://auth.example.workers.dev/', appSlug: 'prboard' };

describe('PKCE', () => {
  it('makes verifiers in the allowed charset and length', () => {
    const v = randomString(64);
    expect(v).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(randomString(64)).not.toBe(v);
  });
  it('S256 challenge matches RFC 7636 appendix B', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
  });
  it('builds the authorise URL', async () => {
    const p = newPending(false, 'https://djf1982.github.io/prboard/');
    const u = new URL(await buildAuthorizeUrl(S, p));
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('Iv23liabc');
    expect(u.searchParams.get('state')).toBe(p.state);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('https://djf1982.github.io/prboard/');
  });
});

describe('callback', () => {
  const p = newPending(true, 'https://x.test/', 1000);
  it('ignores pages with no code', () => expect(readCallback('?foo=1', p, 2000).kind).toBe('none'));
  it('accepts the matching state', () => expect(readCallback(`?code=abc&state=${p.state}`, p, 2000)).toEqual({ kind: 'code', code: 'abc', pending: p }));
  it('rejects a wrong or missing state', () => {
    expect(readCallback('?code=abc&state=nope', p, 2000).kind).toBe('error');
    expect(readCallback('?code=abc', p, 2000).kind).toBe('error');
  });
  it('rejects a callback with no sign-in in progress', () => expect(readCallback(`?code=abc&state=${p.state}`, null).kind).toBe('error'));
  it('rejects a stale sign-in', () => expect(readCallback(`?code=abc&state=${p.state}`, p, 1000 + 11 * 60_000).kind).toBe('error'));
  it('reports a cancelled sign-in', () => {
    expect(readCallback(`?error=access_denied&state=${p.state}`, p, 2000)).toEqual({ kind: 'error', message: 'You cancelled sign-in.' });
  });
  it('strips OAuth parameters only', () => {
    expect(stripCallbackParams('?code=a&state=b&view=2')).toBe('?view=2');
    expect(stripCallbackParams('?code=a&state=b')).toBe('');
  });
});

describe('sessions', () => {
  it('reads token responses', () => {
    const s = sessionFromResponse({ access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_y', refresh_token_expires_in: 15897600 }, 0);
    expect(s).toEqual({ accessToken: 'ghu_x', expiresAt: 28_800_000, refreshToken: 'ghr_y', refreshExpiresAt: 15_897_600_000 });
    expect(() => sessionFromResponse({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' })).toThrow(/incorrect/);
  });
  it('refreshes five minutes early', () => {
    const s = { accessToken: 'a', expiresAt: 10 * 60_000, refreshToken: 'r', refreshExpiresAt: null };
    expect(needsRefresh(s, 0)).toBe(false);
    expect(needsRefresh(s, 6 * 60_000)).toBe(true);
  });
  it('posts to the exchange service with no credentials', async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ access_token: 'ghu_1', expires_in: 60 })));
    const p = newPending(false, 'https://x.test/');
    await exchangeCode(S, 'c0de', p, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://auth.example.workers.dev/token');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual({ code: 'c0de', code_verifier: p.verifier, redirect_uri: 'https://x.test/' });
    await refreshSession(S, 'ghr_1', f as unknown as typeof fetch);
    expect(f.mock.calls[1]![0]).toBe('https://auth.example.workers.dev/refresh');
  });
  it('reports exchange errors', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'bad_redirect_uri' }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode(S, 'c', newPending(false, 'https://x.test/'), f)).rejects.toThrow('bad_redirect_uri');
  });
  it('install URL and enabled flag', () => {
    expect(installUrl(S)).toBe('https://github.com/apps/prboard/installations/new');
    expect(oauthEnabled({ clientId: '', exchangeUrl: '', appSlug: '' })).toBe(false);
  });
});

describe('client refresh on 401', () => {
  it('retries once with the new token', async () => {
    let token = 'old';
    const seen: string[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization!;
      seen.push(auth);
      return auth.endsWith('new') ? new Response(JSON.stringify({ data: { ok: 1 } })) : new Response('{}', { status: 401 });
    });
    const onUnauthorized = vi.fn(async () => { token = 'new'; return true; });
    const c = createClient('https://api.github.com/graphql', () => token, f as unknown as typeof fetch, { onUnauthorized });
    expect((await c.query('{x}')).data).toEqual({ ok: 1 });
    expect(seen).toEqual(['bearer old', 'bearer new']);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it('does not loop when the new token also fails', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 401 }));
    const c = createClient('https://api.github.com/graphql', () => 't', f as unknown as typeof fetch, { onUnauthorized: async () => true });
    await expect(c.query('{x}')).rejects.toMatchObject({ kind: 'auth' });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
