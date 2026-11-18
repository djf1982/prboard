<script lang="ts">
  import type { Auth } from '../auth/auth.svelte';
  import { DEFAULT_API_URL } from '../github/client';

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
  <h1>prboard</h1>
  <p class="lede">A pull-request dashboard with the columns you choose, including auto-merge status.</p>

  <form onsubmit={submit}>
    <label for="token">GitHub personal access token</label>
    <input id="token" type="password" autocomplete="off" spellcheck="false" bind:value={token} placeholder="github_pat_…" required />
    <label class="check"><input type="checkbox" bind:checked={remember} /> Remember me on this device (localStorage)</label>
    <button type="button" class="link" onclick={() => (advanced = !advanced)}>{advanced ? 'Hide' : 'Show'} GitHub Enterprise settings</button>
    {#if advanced}
      <label for="api">GraphQL API URL</label>
      <input id="api" type="url" bind:value={apiUrl} />
      <p class="hint">For GitHub Enterprise Server use https://HOST/api/graphql. The site's Content Security Policy must also allow that host (build with PRBOARD_API_HOSTS).</p>
    {/if}
    <button type="submit" disabled={auth.status === 'checking' || !token.trim()}>
      {auth.status === 'checking' ? 'Checking…' : 'Sign in'}
    </button>
    {#if auth.status === 'error' && auth.error}<p class="error" role="alert">{auth.error}</p>{/if}
  </form>

  <section class="help">
    <h2>Your token stays in this browser</h2>
    <p>prboard has no server. Your browser sends the token only to the GitHub API. It is kept in sessionStorage (cleared when you close the tab) unless you pick "remember me".</p>
    <h2>Make a token</h2>
    <ol>
      <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">new fine-grained token</a>.</li>
      <li>Pick the resource owner (you or your organisation) and the repositories.</li>
      <li>Repository permissions to <strong>read</strong>: Pull requests and Commit statuses (Metadata is added for you).</li>
      <li>Fine-grained tokens have no Checks permission, so the <strong>Checks</strong> column may show "no access" for GitHub Actions checks. A classic token with the <code>repo</code> scope can read them, but it also has write access to every repository you can reach.</li>
      <li>To use the <strong>Actions</strong> column (auto-merge, ready for review, merge queue, approve), set Pull requests to <strong>Read and write</strong>. Update branch also needs Contents: read and write.</li>
    </ol>
    <p class="hint">Organisations can require approval for fine-grained tokens. Classic tokens need SSO authorisation in SAML organisations.</p>
  </section>
</main>

<style>
  .token-screen { max-width: 560px; margin: 8vh auto; padding: 0 20px; }
  h1 { margin: 0 0 4px; }
  .lede { color: var(--muted); margin-top: 0; }
  form { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-raised); }
  label { font-weight: 600; font-size: 13px; }
  label.check { font-weight: 400; display: flex; align-items: center; gap: 6px; }
  .link { background: none; border: 0; color: var(--accent); padding: 0; justify-self: start; cursor: pointer; font: inherit; font-size: 13px; }
  .hint { color: var(--muted); font-size: 12px; margin: 0; }
  .error { color: var(--bad); margin: 0; }
  .help h2 { font-size: 15px; margin: 20px 0 4px; }
  .help { font-size: 14px; }
</style>
