/**
 * prboard token exchange (Cloudflare Worker).
 *
 * GitHub's OAuth token endpoint has no CORS support and needs the client
 * secret, so a browser-only app cannot finish sign-in. This Worker adds the
 * secret and forwards one request. It is stateless: it stores nothing and
 * logs nothing. Tokens pass through it only at sign-in and at refresh.
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Exact origin of the site, for example https://djf1982.github.io. Several allowed, space-separated. */
  ALLOWED_ORIGINS: string;
  /** Redirect URIs the site uses, space-separated. Must match the GitHub App settings. */
  REDIRECT_URIS: string;
}

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const MAX_BODY = 4096;
const CODE = /^[A-Za-z0-9_-]{1,100}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const REFRESH = /^[A-Za-z0-9_]{1,1000}$/;
const PASS_THROUGH = ['access_token', 'expires_in', 'refresh_token', 'refresh_token_expires_in', 'token_type', 'scope', 'error', 'error_description'];

const list = (s: string | undefined) => (s ?? '').split(/\s+/).filter(Boolean);

function cors(origin: string | null, env: Env): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && list(env.ALLOWED_ORIGINS).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers = cors(origin, env);
  const allowed = 'Access-Control-Allow-Origin' in headers;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers });
  // A person opening the address in a browser: explain, instead of a bare 403.
  if (request.method === 'GET' && url.pathname === '/') {
    return new Response('prboard sign-in service. It only handles sign-in requests from https://djf1982.github.io/prboard/. Open that page instead.\n', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (!allowed) return json({ error: 'origin_not_allowed' }, 403, headers);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, headers);
  if (url.pathname !== '/token' && url.pathname !== '/refresh') return json({ error: 'not_found' }, 404, headers);
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) return json({ error: 'bad_content_type' }, 415, headers);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return json({ error: 'not_configured' }, 500, headers);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, headers);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400, headers);
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400, headers);

  const form = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET });
  if (url.pathname === '/token') {
    const { code, code_verifier, redirect_uri } = body;
    if (typeof code !== 'string' || !CODE.test(code)) return json({ error: 'bad_code' }, 400, headers);
    if (typeof code_verifier !== 'string' || !VERIFIER.test(code_verifier)) return json({ error: 'bad_code_verifier' }, 400, headers);
    if (typeof redirect_uri !== 'string' || !list(env.REDIRECT_URIS).includes(redirect_uri)) return json({ error: 'bad_redirect_uri' }, 400, headers);
    form.set('code', code);
    form.set('code_verifier', code_verifier);
    form.set('redirect_uri', redirect_uri);
  } else {
    const { refresh_token } = body;
    if (typeof refresh_token !== 'string' || !REFRESH.test(refresh_token)) return json({ error: 'bad_refresh_token' }, 400, headers);
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refresh_token);
  }

  let gh: Response;
  try {
    gh = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'prboard-token-exchange' },
      body: form.toString(),
    });
  } catch {
    return json({ error: 'github_unreachable' }, 502, headers);
  }
  let data: Record<string, unknown>;
  try {
    data = (await gh.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'github_bad_response' }, 502, headers);
  }
  // Return only known fields. Never echo the request or the secret.
  const out = Object.fromEntries(PASS_THROUGH.filter((k) => k in data).map((k) => [k, data[k]]));
  const status = !gh.ok ? 502 : out.error ? 400 : 200;
  return json(out, status, headers);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
