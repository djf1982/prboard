import { createClient, DEFAULT_API_URL, normaliseApiUrl, type Client } from '../github/client';
import { KEYS, clearAll, read, remove, writeTo } from './storage';
import {
  OAUTH, PENDING_KEY, buildAuthorizeUrl, exchangeCode, needsRefresh, newPending, oauthEnabled, readCallback,
  redirectUriFor, refreshSession, stripCallbackParams, type AppSession, type Pending,
} from './oauth';

/**
 * Two ways to sign in:
 * - a personal access token (no server involved), or
 * - "Sign in with GitHub" through the prboard GitHub App (a stateless exchange service adds the client secret).
 * Tokens live only in this browser: sessionStorage by default, localStorage with "remember me".
 */
export class Auth {
  kind = $state<'pat' | 'app' | null>(null);
  apiUrl = $state(DEFAULT_API_URL);
  login = $state<string | null>(null);
  remember = $state(false);
  status = $state<'signed-out' | 'checking' | 'signed-in' | 'error'>('signed-out');
  error = $state<string | null>(null);

  #pat: string | null = null;
  #session: AppSession | null = null;
  #refreshing: Promise<boolean> | null = null;

  /** Stable while signed in; reads the current token on every request. */
  client = $derived<Client | null>(
    this.status === 'signed-in'
      ? createClient(this.apiUrl, () => this.#currentToken(), undefined, { onUnauthorized: () => this.#refresh() })
      : null,
  );

  /** For scrubbing the token out of text. */
  get token(): string | null {
    return this.#pat ?? this.#session?.accessToken ?? null;
  }

  constructor() {
    const api = read(KEYS.apiUrl);
    if (api) this.apiUrl = api.value;
    if (oauthEnabled() && typeof location !== 'undefined' && /[?&](code|error)=/.test(location.search)) {
      void this.#finishAppSignIn();
      return;
    }
    const s = read(KEYS.session);
    if (s) {
      try {
        this.#session = JSON.parse(s.value) as AppSession;
        this.remember = s.where === 'local';
        this.kind = 'app';
        this.apiUrl = DEFAULT_API_URL;
        void this.#verify();
        return;
      } catch {
        remove(KEYS.session);
      }
    }
    const t = read(KEYS.token);
    if (t) {
      this.remember = t.where === 'local';
      void this.signIn(t.value, this.remember, this.apiUrl);
    }
  }

  /** Personal access token sign-in. */
  async signIn(token: string, remember: boolean, apiUrl: string): Promise<boolean> {
    this.status = 'checking';
    this.error = null;
    try {
      const url = normaliseApiUrl(apiUrl || DEFAULT_API_URL);
      const trimmed = token.trim();
      const login = await viewerLogin(url, trimmed);
      this.#pat = trimmed;
      this.#session = null;
      this.kind = 'pat';
      this.apiUrl = url;
      this.remember = remember;
      this.login = login;
      remove(KEYS.token);
      remove(KEYS.session);
      writeTo(remember ? 'local' : 'session', KEYS.token, trimmed);
      writeTo('local', KEYS.apiUrl, url);
      this.status = 'signed-in';
      return true;
    } catch (e) {
      this.#fail((e as Error).message);
      return false;
    }
  }

  /** "Sign in with GitHub": goes to GitHub, which returns to this page with ?code. */
  async startAppSignIn(remember: boolean): Promise<void> {
    const pending = newPending(remember, redirectUriFor(location));
    writeTo('session', PENDING_KEY, JSON.stringify(pending));
    location.assign(await buildAuthorizeUrl(OAUTH, pending));
  }

  async #finishAppSignIn() {
    this.status = 'checking';
    const raw = read(PENDING_KEY);
    remove(PENDING_KEY);
    let pending: Pending | null = null;
    try { pending = raw ? (JSON.parse(raw.value) as Pending) : null; } catch { pending = null; }
    const result = readCallback(location.search, pending);
    // Remove the one-time code from the address bar and history.
    history.replaceState(null, '', location.pathname + stripCallbackParams(location.search) + location.hash);
    if (result.kind === 'none') { this.status = 'signed-out'; return; }
    if (result.kind === 'error') { this.#fail(result.message); return; }
    try {
      this.#session = await exchangeCode(OAUTH, result.code, result.pending);
      this.remember = result.pending.remember;
      this.kind = 'app';
      this.apiUrl = DEFAULT_API_URL;
      this.#saveSession();
      await this.#verify();
    } catch (e) {
      this.#fail((e as Error).message);
    }
  }

  async #verify() {
    this.status = 'checking';
    try {
      this.login = await viewerLogin(this.apiUrl, await this.#currentToken());
      this.status = 'signed-in';
    } catch (e) {
      if (this.kind === 'app' && (await this.#refresh())) {
        try {
          this.login = await viewerLogin(this.apiUrl, await this.#currentToken());
          this.status = 'signed-in';
          return;
        } catch { /* fall through */ }
      }
      this.#fail((e as Error).message);
    }
  }

  async #currentToken(): Promise<string> {
    if (this.#pat) return this.#pat;
    if (!this.#session) throw new Error('Not signed in.');
    if (needsRefresh(this.#session)) await this.#refresh();
    return this.#session!.accessToken;
  }

  /** Single-flight refresh. A failure signs the user out with a clear message. */
  #refresh(): Promise<boolean> {
    if (this.kind !== 'app' || !this.#session?.refreshToken) return Promise.resolve(false);
    this.#refreshing ??= (async () => {
      try {
        this.#session = await refreshSession(OAUTH, this.#session!.refreshToken!);
        this.#saveSession();
        return true;
      } catch (e) {
        this.signOut();
        this.error = `Your GitHub session ended (${(e as Error).message}). Please sign in again.`;
        this.status = 'error';
        return false;
      } finally {
        this.#refreshing = null;
      }
    })();
    return this.#refreshing;
  }

  #saveSession() {
    remove(KEYS.token);
    remove(KEYS.session);
    writeTo(this.remember ? 'local' : 'session', KEYS.session, JSON.stringify(this.#session));
  }

  #fail(message: string) {
    this.#pat = null;
    this.#session = null;
    this.kind = null;
    this.status = 'error';
    this.error = message;
    remove(KEYS.token);
    remove(KEYS.session);
  }

  /** Clears the token, the config and everything else this app stored. */
  signOut(): void {
    clearAll();
    this.#pat = null;
    this.#session = null;
    this.kind = null;
    this.login = null;
    this.apiUrl = DEFAULT_API_URL;
    this.status = 'signed-out';
  }
}

async function viewerLogin(apiUrl: string, token: string): Promise<string> {
  const res = await createClient(apiUrl, token).query<{ viewer: { login: string } }>('query { viewer { login } }');
  if (!res.data?.viewer?.login) throw new Error(res.errors[0]?.message ?? 'GitHub did not return a user for this token.');
  return res.data.viewer.login;
}
