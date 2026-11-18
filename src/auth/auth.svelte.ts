import { createClient, DEFAULT_API_URL, normaliseApiUrl, type Client } from '../github/client';
import { KEYS, clearAll, read, remove, writeTo } from './storage';

/**
 * The token lives only in this browser: in sessionStorage by default, or in
 * localStorage when the user picks "remember me". It is sent only to the
 * configured GitHub API URL.
 */
export class Auth {
  token = $state<string | null>(null);
  apiUrl = $state(DEFAULT_API_URL);
  login = $state<string | null>(null);
  remember = $state(false);
  status = $state<'signed-out' | 'checking' | 'signed-in' | 'error'>('signed-out');
  error = $state<string | null>(null);
  client = $derived<Client | null>(this.token && this.status === 'signed-in' ? createClient(this.apiUrl, this.token) : null);

  constructor() {
    const api = read(KEYS.apiUrl);
    if (api) this.apiUrl = api.value;
    const t = read(KEYS.token);
    if (t) {
      this.remember = t.where === 'local';
      void this.signIn(t.value, this.remember, this.apiUrl);
    }
  }

  async signIn(token: string, remember: boolean, apiUrl: string): Promise<boolean> {
    this.status = 'checking';
    this.error = null;
    try {
      const url = normaliseApiUrl(apiUrl || DEFAULT_API_URL);
      const trimmed = token.trim();
      const res = await createClient(url, trimmed).query<{ viewer: { login: string } }>('query { viewer { login } }');
      if (!res.data?.viewer?.login) throw new Error(res.errors[0]?.message ?? 'GitHub did not return a user for this token.');
      this.token = trimmed;
      this.apiUrl = url;
      this.remember = remember;
      this.login = res.data.viewer.login;
      remove(KEYS.token);
      writeTo(remember ? 'local' : 'session', KEYS.token, trimmed);
      writeTo('local', KEYS.apiUrl, url);
      this.status = 'signed-in';
      return true;
    } catch (e) {
      this.status = 'error';
      this.error = (e as Error).message;
      this.token = null;
      return false;
    }
  }

  /** Clears the token, the config and everything else this app stored. */
  signOut(): void {
    clearAll();
    this.token = null;
    this.login = null;
    this.apiUrl = DEFAULT_API_URL;
    this.status = 'signed-out';
  }
}
