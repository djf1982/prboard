<script lang="ts">
  import type { PullRequestNode } from '../github/types';
  import { availableActions } from '../actions/registry';
  import type { ActionDef } from '../actions/types';
  import type { Client } from '../github/client';

  let { pr, client, onDone, onWriteDenied }: {
    pr: PullRequestNode;
    client: Client | null;
    onDone: () => void;
    onWriteDenied: (message: string) => void;
  } = $props();

  const actions = $derived(availableActions(pr));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let menu: HTMLDetailsElement | undefined = $state();

  // Actions run only from a click. Configs can never start one.
  async function run(action: ActionDef, choice?: string) {
    if (!client || busy) return;
    if (menu) menu.open = false;
    const prompt = action.confirm?.(pr, choice);
    if (prompt && !window.confirm(prompt)) return;
    busy = true;
    error = null;
    try {
      const { query, variables } = action.mutation(pr, choice);
      const res = await client.query(query, variables);
      if (res.errors.length) throw new Error(res.errors.map((e) => e.message).join('; '));
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      error = msg;
      if (/not accessible by (personal access|integration)|must have (push|write)|insufficient/i.test(msg))
        onWriteDenied(`${action.label} failed: the token cannot write. It needs ${action.requires.join(', ')}.`);
    } finally {
      busy = false;
    }
  }
</script>

{#if actions.length}
  <details class="actions" bind:this={menu}>
    <summary aria-label="Actions">{busy ? 'Working…' : 'Actions ▾'}</summary>
    <ul role="menu">
      {#each actions as action (action.id)}
        {@const choices = action.choices?.(pr) ?? []}
        {#if choices.length > 1}
          <li role="none" class="group">
            <span class="group-label">{action.label}</span>
            {#each choices as c (c.id)}
              <button role="menuitem" title={action.description} onclick={() => run(action, c.id)}>{c.label}</button>
            {/each}
          </li>
        {:else}
          <li role="none">
            <button role="menuitem" title={action.description} onclick={() => run(action, choices[0]?.id)}>{action.label}</button>
          </li>
        {/if}
      {/each}
    </ul>
  </details>
{:else}
  <span class="muted">—</span>
{/if}
{#if error}<span class="err" title={error}>failed</span>{/if}

<style>
  .actions { position: relative; display: inline-block; }
  summary { cursor: pointer; list-style: none; font-size: 12px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; user-select: none; }
  summary::-webkit-details-marker { display: none; }
  ul { position: absolute; z-index: 20; right: 0; margin: 4px 0 0; padding: 4px; list-style: none; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); min-width: 200px; }
  li { display: block; }
  li.group { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 4px 6px; }
  .group-label { width: 100%; font-size: 12px; color: var(--muted); }
  li.group button { width: auto; border: 1px solid var(--border); }
  button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 4px 8px; border-radius: 4px; font: inherit; color: inherit; cursor: pointer; }
  button:hover { background: var(--hover); }
  .err { color: var(--bad); font-size: 12px; margin-left: 4px; }
  .muted { color: var(--muted); }
</style>
