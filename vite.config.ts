import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The strict CSP is added only to production builds. Vite's dev server injects
// inline styles and scripts for hot reload, which a strict policy would block.
// To support GitHub Enterprise Server, add your host to PRBOARD_API_HOSTS at build time.
const apiHosts = (process.env.PRBOARD_API_HOSTS ?? 'https://api.github.com').split(/\s+/).filter(Boolean);

// GitHub App sign-in. Leave empty to build a token-only site (no server involved).
const oauth = {
  clientId: process.env.PRBOARD_OAUTH_CLIENT_ID ?? '',
  exchangeUrl: process.env.PRBOARD_OAUTH_EXCHANGE_URL ?? '',
  appSlug: process.env.PRBOARD_APP_SLUG ?? '',
};
const exchangeOrigin = oauth.exchangeUrl ? new URL(oauth.exchangeUrl).origin : '';

const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${[...apiHosts, exchangeOrigin].filter(Boolean).join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'prboard-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), cspPlugin()],
  define: { __API_HOSTS__: JSON.stringify(apiHosts), __OAUTH__: JSON.stringify(oauth) },
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
