<script lang="ts">
  import type { Auth } from '../auth/auth.svelte';
  import { DEFAULT_API_URL } from '../github/client';
  import { oauthEnabled } from '../auth/oauth';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  const appSignIn = oauthEnabled();
  // svelte-ignore state_referenced_locally
  let showPat = $state(!appSignIn);

  let { auth }: { auth: Auth } = $props();
  let token = $state('');
  // svelte-ignore state_referenced_locally
  let remember = $state(auth.remember);
  // svelte-ignore state_referenced_locally
  let apiUrl = $state(auth.apiUrl || DEFAULT_API_URL);
  let advanced = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (await auth.signIn(token, remember, apiUrl)) token = '';
  }
</script>

<main class="token-screen">
  <div class="hero">
    <h1><Logo size={26} /></h1>
    <p class="lede">Your pull requests, with the columns you choose — including auto-merge.</p>
  </div>

  <div class="card">
    {#if appSignIn}
      <div class="app-signin">
        <button class="primary big" disabled={auth.status === 'checking'} onclick={() => auth.startAppSignIn(remember)}>
          <Icon id="github" size={16} /> {auth.status === 'checking' ? 'Signing in…' : 'Sign in with GitHub'}
        </button>
        <label class="check"><input type="checkbox" bind:checked={remember} /> Remember me on this device</label>
        <p class="hint">Uses the prboard GitHub App. It can read checks, which personal access tokens cannot.
          A small sign-in service sees your token once at sign-in and at each renewal; it stores nothing.</p>
        {#if auth.status === 'error' && auth.error && !showPat}<p class="error" role="alert"><Icon id="alert" size={13} /> {auth.error}</p>{/if}
      </div>
      <div class="or"><span>or</span></div>
      <button type="button" class="link" onclick={() => (showPat = !showPat)}>{showPat ? 'Hide token sign-in' : 'Use a personal access token'}</button>
    {/if}

    {#if showPat}
    <form onsubmit={submit}>
      <label class="field-label" for="token">Personal access token</label>
      <input id="token" type="password" autocomplete="off" spellcheck="false" bind:value={token} placeholder="github_pat_…" required />
      <label class="check"><input type="checkbox" bind:checked={remember} /> Remember me on this device</label>
      <button type="button" class="link" onclick={() => (advanced = !advanced)}>{advanced ? 'Hide' : 'Show'} GitHub Enterprise settings</button>
      {#if advanced}
        <label class="field-label" for="api">GraphQL API URL</label>
        <input id="api" type="url" bind:value={apiUrl} />
        <p class="hint">For GitHub Enterprise Server use https://HOST/api/graphql. The site's Content Security Policy must also allow that host (build with PRBOARD_API_HOSTS).</p>
      {/if}
      <button type="submit" class="primary big" disabled={auth.status === 'checking' || !token.trim()}>
        {auth.status === 'checking' ? 'Checking…' : 'Sign in'}
      </button>
      {#if auth.status === 'error' && auth.error}<p class="error" role="alert"><Icon id="alert" size={13} /> {auth.error}</p>{/if}
    </form>
    {/if}
  </div>

  <section class="help">
    <div class="trust"><Icon id="lock" size={16} />
      <div>
        <h2>Your token stays in this browser</h2>
        <p>prboard has no server. Your browser sends the token only to the GitHub API. It is kept in sessionStorage (cleared when you close the tab) unless you pick "remember me".</p>
      </div>
    </div>
    <details>
      <summary>How to make a token</summary>
      <ol>
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">new fine-grained token</a>.</li>
        <li>Pick the resource owner (you or your organisation) and the repositories.</li>
        <li>Repository permissions to <strong>read</strong>: Pull requests and Commit statuses (Metadata is added for you).</li>
        <li>Fine-grained tokens have no Checks permission, so the <strong>Checks</strong> column may show "no access" for GitHub Actions checks. A classic token with the <code>repo</code> scope can read them, but it also has write access to every repository you can reach.</li>
        <li>To use the <strong>Actions</strong> column (auto-merge, ready for review, merge queue, approve), set Pull requests to <strong>Read and write</strong>. Update branch also needs Contents: read and write.</li>
      </ol>
      <p class="hint">Organisations can require approval for fine-grained tokens. Classic tokens need SSO authorisation in SAML organisations.</p>
    </details>
  </section>
</main>

<style>
  .token-screen { max-width: 420px; margin: 0 auto; padding: 12vh 20px 48px; }
  .hero { display: grid; justify-items: center; text-align: center; gap: 14px; margin-bottom: 28px; }
  h1 { margin: 0; display: inline-flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 600; letter-spacing: -.025em; }
  .lede { color: var(--muted); margin: 0; font-size: 14px; }
  .card { display: grid; gap: 14px; padding: 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-raised); box-shadow: var(--card-shadow); }
  .app-signin, form { display: grid; gap: 10px; }
  .field-label { margin-bottom: -4px; }
  input:not([type='checkbox']) { width: 100%; height: 36px; }
  .big { height: 38px; font-size: 14px; width: 100%; }
  label.check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--fg-soft); }
  .link { background: none; border: 0; color: var(--accent); padding: 0; height: auto; justify-self: center; font-weight: 500; }
  .link:hover:not(:disabled) { background: none; text-decoration: underline; color: var(--accent); }
  .or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .error { display: flex; gap: 6px; align-items: flex-start; color: var(--bad); margin: 0; font-size: 13px; }
  .help { margin-top: 24px; display: grid; gap: 14px; font-size: 13px; color: var(--fg-soft); }
  .trust { display: flex; gap: 12px; align-items: flex-start; color: var(--muted); }
  .trust h2 { margin: 0 0 2px; font-size: 13px; font-weight: 600; color: var(--fg); }
  .trust p { margin: 0; color: var(--muted); }
  details { border-top: 1px solid var(--border-soft); padding-top: 12px; }
  summary { cursor: pointer; font-weight: 500; color: var(--fg); }
  ol { padding-left: 18px; color: var(--muted); display: grid; gap: 6px; }
</style>
