# Plan: sign in with GitHub (GitHub App user authorisation)

Status: **done**, 2026-11-18. App `prboard-17things`; Worker at `https://prboard-auth.17things.co.uk` (17 Things Cloudflare account); installed on Scoutstuff; checks column verified. Still to check: enqueue/dequeue with the app token.

## Why

Fine-grained personal access tokens have no **Checks** permission, so they cannot read GitHub Actions check runs.
Classic tokens can, but only with the `repo` scope, which also grants write access to every repository the user can reach.
A sign-in button is also easier than making a token by hand.

## Decision: a GitHub App, not an OAuth App

Both use the same OAuth 2.0 web flow. The difference is what the token can do.

| | OAuth App | GitHub App (user token) |
| --- | --- | --- |
| Permissions | Scopes. No read-only repo scope: `repo` is full access. | Fine-grained, read or write per area. Has **Checks: read**. |
| Token lifetime | Does not expire | 8 hours, with a 6-month refresh token |
| Org access | Org approves the OAuth App | App must be **installed** on the org (or repos) |

The user token can reach only what both the app and the user can reach. It can see only the repos where the app is installed.

## Facts checked (2026-11-18)

- Token endpoint `https://github.com/login/oauth/access_token` sends **no CORS headers** (tested with curl: no `Access-Control-Allow-Origin`). A browser cannot call it.
- The web flow token exchange **requires `client_secret`** (GitHub App docs). PKCE (`S256` only) is supported and recommended, but it does not remove the secret.
- So a small server-side token exchange is required. This was already listed as "Later" in `claude.md`.

## Architecture

```
Browser (GitHub Pages)                Exchange (Cloudflare Worker)         GitHub
1. Sign in --------------------------------------------------------------> /login/oauth/authorize
                                                                            (client_id, state, PKCE challenge, redirect_uri)
2. <------------------------------------------------- redirect ?code&state
3. POST /token {code, code_verifier} -> adds client_secret ------------->  /login/oauth/access_token
4. <------------------- {access_token, expires_in, refresh_token} <-------
5. Browser calls api.github.com directly with the access token (as today)
6. Near expiry or on 401: POST /refresh {refresh_token} -> same as 3-4
```

### Exchange Worker (`worker/`)

- About 80 lines of TypeScript, no dependencies. Two routes: `POST /token` and `POST /refresh`.
- Holds `GITHUB_CLIENT_SECRET` as a Worker secret. `GITHUB_CLIENT_ID` and `ALLOWED_ORIGIN` as vars.
- CORS: allows only `ALLOWED_ORIGIN` (`https://djf1982.github.io`). Rejects other origins.
- Validates input shape and size. Forwards only `code`, `code_verifier`, `redirect_uri` or `refresh_token`.
- **Stateless. No storage, no logging of bodies or tokens.** Errors return GitHub's error code only.
- Self-hostable: anyone can deploy their own Worker and GitHub App, and build the site with their own values.

### GitHub App settings

- Owner: `djf1982`. Name: `prboard` (or similar). Public, so other orgs can install it.
- Callback URL: `https://djf1982.github.io/prboard/`. Plus `http://localhost:5173/` in a separate dev app.
- "Expire user authorization tokens": on. "Request user authorization during installation": on. Webhooks: off.
- Repository permissions:
  - Pull requests: **read and write** (actions)
  - Checks: **read**
  - Commit statuses: **read**
  - Contents: **read and write** (update branch, load `.github/prboard.yml`)
  - Merge queues: read and write, if the enqueue/dequeue mutations need it (to check)
  - Metadata: read (automatic)
- Organisation permissions: Members: read (team names in pending reviewers).
- A read-only variant of the app is possible later, for people who do not want actions.

### Client changes

- `src/auth/oauth.ts`: create `state` and a PKCE verifier (Web Crypto), keep them in sessionStorage, redirect to authorise, handle the callback (check `state`, then remove `?code` from the URL with `history.replaceState`), call the Worker.
- `src/auth/auth.svelte.ts`: token kind `pat | app`; keep `expiresAt` and the refresh token. Refresh about 5 minutes before expiry, and once on a 401, then retry the request. A failed refresh signs out with a clear message.
- Storage: same rules as today. sessionStorage by default; localStorage only with "remember me". The refresh token follows the same choice. Sign-out clears both.
- Token screen: "Sign in with GitHub" as the main button. "Use a personal access token" stays as the option that needs no server.
- Install hint: when signed in through the app, show "Install prboard on an organisation" (`https://github.com/apps/<slug>/installations/new`). Show a hint when a view returns repos the app cannot see.
- Build-time config: `PRBOARD_OAUTH_CLIENT_ID`, `PRBOARD_OAUTH_EXCHANGE_URL`. If they are empty, the button is hidden (forks keep working with tokens).
- CSP: add the Worker origin to `connect-src`. Nothing else changes.
- Field `requires`: switch to app permission names, so "no access" can say "install the app on this org" or "the app lacks Checks: read".

## Trust model change (README and claude.md principle 1)

Today: "no backend". After: "no backend for your data. An optional, stateless token exchange sees the token once at sign-in and at each refresh. It stores nothing. Its code is in `worker/`, and you can run your own, or use a personal access token and skip it."

## Tests

- PKCE: verifier length and charset; challenge is base64url SHA-256.
- Callback: rejects a missing or wrong `state`; removes `code` from the URL; ignores a callback with no pending sign-in.
- Refresh: scheduled before expiry; runs once on 401; a failure signs out; no refresh loop.
- Worker (unit, with a fake fetch): CORS allowlist; rejects bad input and wrong methods; never echoes the secret; maps GitHub errors.
- Manual: sign in on the live site; install the app on Scoutstuff; the `checks` column shows counts on scoutworks PRs; actions work; a token refresh works (force by editing `expiresAt`).

## Steps

1. **You:** create the GitHub App (settings above) and give me the client ID and app slug. Generate a client secret.
2. **You:** `npx wrangler login` (once). **Me:** add `worker/`, deploy it, and set the secret with `wrangler secret put` (you paste the secret in your terminal, not in chat).
3. **Me:** client flow, refresh, token screen, CSP, tests. One PR-sized commit each.
4. **Org owner:** install the app on Scoutstuff and choose the repos.
5. **Me:** README and claude.md trust-model update; CI type-checks the Worker; optional Worker deploy workflow (needs a `CLOUDFLARE_API_TOKEN` repo secret).
6. **You + me:** manual checks above, then remove "Checks needs a classic token" from the docs.

## Open questions

- Should the app request write permissions, or should there be two apps (read-only and read-write)? Recommended: one app with write. Actions already need confirmation.
- Worker host: `*.workers.dev` (free, no setup) or a custom domain.
- Is enqueue/dequeue covered by Pull requests: write, or does it need Merge queues: write? Test after step 1.
