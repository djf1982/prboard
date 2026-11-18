/**
 * GitHub App user sign-in (OAuth web flow with PKCE).
 * The browser keeps state and the PKCE verifier; a stateless exchange
 * service adds the client secret (see worker/).
 */

export interface OAuthSettings {
  clientId: string;
  exchangeUrl: string;
  appSlug: string;
}

export const OAUTH: OAuthSettings = __OAUTH__;

export function oauthEnabled(s: OAuthSettings = OAUTH): boolean {
  return !!(s.clientId && s.exchangeUrl);
}

export const PENDING_KEY = 'prboard.oauth.pending';

export interface Pending {
  state: string;
  verifier: string;
  remember: boolean;
  redirectUri: string;
  createdAt: number;
}

export interface AppSession {
  accessToken: string;
  /** ms since epoch */
  expiresAt: number;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
}

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += UNRESERVED[b % UNRESERVED.length];
  return out;
}

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** The redirect URI is the page itself, without query or hash. It must be registered in the GitHub App. */
export function redirectUriFor(loc: { origin: string; pathname: string }): string {
  return loc.origin + loc.pathname;
}

export async function buildAuthorizeUrl(s: OAuthSettings, pending: Pending): Promise<string> {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', s.clientId);
  u.searchParams.set('redirect_uri', pending.redirectUri);
  u.searchParams.set('state', pending.state);
  u.searchParams.set('code_challenge', await pkceChallenge(pending.verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export function newPending(remember: boolean, redirectUri: string, now = Date.now()): Pending {
  return { state: randomString(32), verifier: randomString(64), remember, redirectUri, createdAt: now };
}

export type CallbackResult =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'code'; code: string; pending: Pending };

const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

/** Reads ?code&state (or ?error) and checks them against the pending sign-in. Pure, for tests. */
export function readCallback(search: string, pending: Pending | null, now = Date.now()): CallbackResult {
  const p = new URLSearchParams(search);
  const code = p.get('code');
  const state = p.get('state');
  const error = p.get('error');
  if (!code && !error) return { kind: 'none' };
  if (!pending) return { kind: 'error', message: 'No sign-in was in progress in this tab. Please sign in again.' };
  if (!state || state !== pending.state) return { kind: 'error', message: 'Sign-in failed: the state did not match. Please try again.' };
  if (now - pending.createdAt > PENDING_MAX_AGE_MS) return { kind: 'error', message: 'Sign-in took too long. Please try again.' };
  if (error) return { kind: 'error', message: error === 'access_denied' ? 'You cancelled sign-in.' : `GitHub returned: ${p.get('error_description') ?? error}` };
  return { kind: 'code', code: code!, pending };
}

/** Removes OAuth parameters from a URL search string, keeping anything else. */
export function stripCallbackParams(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of ['code', 'state', 'error', 'error_description', 'error_uri', 'installation_id', 'setup_action']) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

export function sessionFromResponse(r: TokenResponse, now = Date.now()): AppSession {
  if (!r.access_token) throw new Error(r.error_description || r.error || 'GitHub did not return a token.');
  return {
    accessToken: r.access_token,
    // No expires_in means the app does not use expiring tokens.
    expiresAt: r.expires_in ? now + r.expires_in * 1000 : Number.MAX_SAFE_INTEGER,
    refreshToken: r.refresh_token ?? null,
    refreshExpiresAt: r.refresh_token_expires_in ? now + r.refresh_token_expires_in * 1000 : null,
  };
}

async function post(s: OAuthSettings, path: '/token' | '/refresh', body: unknown, fetchImpl: typeof fetch): Promise<AppSession> {
  let res: Response;
  try {
    res = await fetchImpl(s.exchangeUrl.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`Could not reach the sign-in service: ${(e as Error).message}`);
  }
  let data: TokenResponse = {};
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok && !data.error) throw new Error(`The sign-in service returned ${res.status}.`);
  return sessionFromResponse(data);
}

export function exchangeCode(s: OAuthSettings, code: string, pending: Pending, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<AppSession> {
  return post(s, '/token', { code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri }, fetchImpl);
}

export function refreshSession(s: OAuthSettings, refreshToken: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<AppSession> {
  return post(s, '/refresh', { refresh_token: refreshToken }, fetchImpl);
}

/** Refresh this long before the access token expires. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function needsRefresh(session: AppSession, now = Date.now()): boolean {
  return session.expiresAt - now < REFRESH_MARGIN_MS;
}

export function installUrl(s: OAuthSettings = OAUTH): string | null {
  return s.appSlug ? `https://github.com/apps/${encodeURIComponent(s.appSlug)}/installations/new` : null;
}
