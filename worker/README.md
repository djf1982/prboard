# prboard token exchange

A stateless Cloudflare Worker that finishes GitHub App sign-in for prboard.
GitHub's token endpoint has no CORS support and needs the client secret, so the browser cannot call it.

- `POST /token` `{ code, code_verifier, redirect_uri }`
- `POST /refresh` `{ refresh_token }`

It accepts only the origins in `ALLOWED_ORIGINS` and the redirect URIs in `REDIRECT_URIS`.
It returns only GitHub's token fields. It stores and logs nothing.

## Deploy your own

```sh
cd worker
# set GITHUB_CLIENT_ID, ALLOWED_ORIGINS and REDIRECT_URIS in wrangler.toml
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

The prboard deployment runs on the 17 Things Cloudflare account at `https://prboard-auth.17things.co.uk`.
With several accounts, set `CLOUDFLARE_ACCOUNT_ID` when you run wrangler.

Then build the site with `PRBOARD_OAUTH_CLIENT_ID`, `PRBOARD_OAUTH_EXCHANGE_URL` (the Worker URL) and `PRBOARD_APP_SLUG`.
