import { describe, expect, it, vi } from 'vitest';
import { handle, type Env } from '../worker/src/index';

const env: Env = {
  GITHUB_CLIENT_ID: 'Iv23liabc',
  GITHUB_CLIENT_SECRET: 'super-secret-value',
  ALLOWED_ORIGINS: 'https://djf1982.github.io http://localhost:5173',
  REDIRECT_URIS: 'https://djf1982.github.io/prboard/',
};
const ORIGIN = 'https://djf1982.github.io';
const VERIFIER = 'a'.repeat(64);
const GOOD = { code: 'abc', code_verifier: VERIFIER, redirect_uri: 'https://djf1982.github.io/prboard/' };

const req = (path: string, body: unknown, init: { origin?: string | null; method?: string; type?: string } = {}) =>
  new Request('https://auth.example.workers.dev' + path, {
    method: init.method ?? 'POST',
    headers: { ...(init.origin === null ? {} : { Origin: init.origin ?? ORIGIN }), 'Content-Type': init.type ?? 'application/json' },
    body: init.method === 'OPTIONS' || init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const gh = (data: unknown, status = 200) => vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify(data), { status }));
const F = (f: unknown) => f as unknown as typeof fetch;

describe('token exchange worker', () => {
  it('answers preflight only for allowed origins', async () => {
    const ok = await handle(req('/token', null, { method: 'OPTIONS' }), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await handle(req('/token', null, { method: 'OPTIONS', origin: 'https://evil.test' }), env);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects other origins, methods, paths and content types', async () => {
    expect((await handle(req('/token', {}, { origin: 'https://evil.test' }), env)).status).toBe(403);
    expect((await handle(req('/token', {}, { origin: null }), env)).status).toBe(403);
    expect((await handle(req('/token', null, { method: 'GET' }), env)).status).toBe(405);
    expect((await handle(req('/other', {}), env)).status).toBe(404);
    expect((await handle(req('/token', 'code=x', { type: 'application/x-www-form-urlencoded' }), env)).status).toBe(415);
  });

  it('validates input before calling GitHub', async () => {
    const f = gh({});
    const r = (b: unknown) => handle(req('/token', b), env, F(f));
    expect((await r({ ...GOOD, code_verifier: 'short' })).status).toBe(400);
    expect((await r({ ...GOOD, code: 'a b' })).status).toBe(400);
    expect((await r({ ...GOOD, redirect_uri: 'https://evil.test/' })).status).toBe(400);
    expect((await handle(req('/token', '{nope'), env, F(f))).status).toBe(400);
    expect((await handle(req('/token', 'x'.repeat(5000)), env, F(f))).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });

  it('exchanges a code, adding the secret, and returns only token fields', async () => {
    const f = gh({ access_token: 'ghu_1', expires_in: 28800, refresh_token: 'ghr_1', refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '', extra: 'dropped' });
    const res = await handle(req('/token', GOOD), env, F(f));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({ access_token: 'ghu_1', expires_in: 28800, refresh_token: 'ghr_1', refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '' });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://github.com/login/oauth/access_token');
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get('client_secret')).toBe('super-secret-value');
    expect(sent.get('code_verifier')).toBe(VERIFIER);
    expect(JSON.stringify(body)).not.toContain('super-secret-value');
  });

  it('refreshes', async () => {
    const f = gh({ access_token: 'ghu_2', expires_in: 28800, refresh_token: 'ghr_2' });
    const res = await handle(req('/refresh', { refresh_token: 'ghr_1' }), env, F(f));
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(f.mock.calls[0]![1].body));
    expect(sent.get('grant_type')).toBe('refresh_token');
    expect(sent.get('refresh_token')).toBe('ghr_1');
  });

  it('passes GitHub errors through as 400', async () => {
    const f = gh({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' });
    const res = await handle(req('/token', GOOD), env, F(f));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_verification_code');
  });

  it('refuses to run without a secret', async () => {
    expect((await handle(req('/refresh', { refresh_token: 'ghr_1' }), { ...env, GITHUB_CLIENT_SECRET: '' })).status).toBe(500);
  });
});
