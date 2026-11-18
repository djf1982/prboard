import type { RateLimit } from './types';

export const DEFAULT_API_URL = 'https://api.github.com/graphql';

export interface GraphQLErrorItem {
  message: string;
  type?: string;
  path?: (string | number)[];
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'network' | 'rate-limit' | 'graphql' | 'http',
  ) {
    super(message);
  }
}

export interface GraphQLResult<T> {
  data: T | null;
  errors: GraphQLErrorItem[];
}

/** Removes the token from any text before it is shown, logged or copied. */
export function scrubToken(text: string, token: string | null | undefined): string {
  let out = text;
  if (token && token.length >= 8) out = out.split(token).join('[token]');
  // Also hide anything that looks like a GitHub token.
  return out.replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[token]');
}

export interface Client {
  apiUrl: string;
  query<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResult<T>>;
}

/** Validates the API URL. Only https is allowed, so the token never travels in clear text. */
export function normaliseApiUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== 'https:') throw new Error('The API URL must start with https://');
  url.hash = '';
  url.search = '';
  return url.toString();
}

export interface ClientOptions {
  /** Called once on a 401. Return true if a new token is ready and the request should be retried. */
  onUnauthorized?: () => Promise<boolean>;
}

/** token is a fixed string (personal access token) or a getter (app sign-in, which refreshes). */
export function createClient(
  apiUrl: string,
  tokenOrGetter: string | (() => string | Promise<string>),
  fetchImpl: typeof fetch = fetch.bind(globalThis),
  opts: ClientOptions = {},
): Client {
  const getToken = typeof tokenOrGetter === 'string' ? () => tokenOrGetter : tokenOrGetter;
  async function run<T>(query: string, variables: Record<string, unknown>, retried: boolean): Promise<GraphQLResult<T>> {
      const token = await getToken();
      let res: Response;
      try {
        res = await fetchImpl(apiUrl, {
          method: 'POST',
          headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables }),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
      } catch (e) {
        throw new GitHubError(scrubToken(`Network error: ${(e as Error).message}`, token), 0, 'network');
      }
      const text = await res.text();
      let body: { data?: T; errors?: GraphQLErrorItem[]; message?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
      if (res.status === 401 && !retried && opts.onUnauthorized && (await opts.onUnauthorized()))
        return run<T>(query, variables, true);
      if (res.status === 401) throw new GitHubError('GitHub rejected the token (401). Check that it is valid and not expired.', 401, 'auth');
      if (res.status === 403 || res.status === 429) {
        const msg = body.message ?? 'Forbidden';
        const limited = /rate limit/i.test(msg) || res.headers.get('x-ratelimit-remaining') === '0';
        throw new GitHubError(scrubToken(`GitHub returned ${res.status}: ${msg}`, token), res.status, limited ? 'rate-limit' : 'http');
      }
      if (!res.ok) throw new GitHubError(scrubToken(`GitHub returned ${res.status}: ${body.message ?? res.statusText}`, token), res.status, 'http');
      const errors = (body.errors ?? []).map((e) => ({ ...e, message: scrubToken(e.message, token) }));
      if (!body.data && errors.length) {
        const limited = errors.some((e) => e.type === 'RATE_LIMITED');
        throw new GitHubError(errors.map((e) => e.message).join('; '), res.status, limited ? 'rate-limit' : 'graphql');
      }
      return { data: body.data ?? null, errors };
  }
  return {
    apiUrl,
    query: <T>(query: string, variables: Record<string, unknown> = {}) => run<T>(query, variables, false),
  };
}

export const RATE_LIMIT_SELECTION = 'rateLimit { cost remaining limit resetAt }';
export type WithRateLimit<T> = T & { rateLimit?: RateLimit };
