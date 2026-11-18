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
  let menu: HTMLElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  let top = $state(0);
  let left = $state(0);
  // A stable, safe element id for popovertarget.
  const menuId = $derived('actions-' + pr.id.replace(/[^A-Za-z0-9_-]/g, ''));

  // The menu lives in the browser's top layer (Popover API), so table cells cannot clip it.
  function place(e: Event) {
    if ((e as ToggleEvent).newState !== 'open' || !trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const width = Math.max(menu.offsetWidth, 220);
    left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const below = r.bottom + 4;
    top = below + menu.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - menu.offsetHeight - 4) : below;
  }

  $effect(() => {
    const close = () => menu?.hidePopover?.();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  });

  // Actions run only from a click. Configs can never start one.
  async function run(action: ActionDef, choice?: string) {
    if (!client || busy) return;
    menu?.hidePopover?.();
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
  <button class="trigger" bind:this={trigger} popovertarget={menuId} aria-haspopup="menu" disabled={busy}>{busy ? 'Working…' : 'Actions ▾'}</button>
  <div class="menu" id={menuId} popover="auto" bind:this={menu} ontoggle={place} style:top="{top}px" style:left="{left}px">
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
  </div>
{:else}
  <span class="muted">—</span>
{/if}
{#if error}<span class="err" title={error}>failed</span>{/if}

<style>
  .trigger { font-size: 12px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-raised); cursor: pointer; }
  .menu { position: fixed; inset: auto; margin: 0; padding: 4px; background: var(--bg-raised); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); min-width: 220px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: block; }
  li.group { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 4px 6px; }
  .group-label { width: 100%; font-size: 12px; color: var(--muted); }
  li.group button { width: auto; border: 1px solid var(--border); }
  ul button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 4px 8px; border-radius: 4px; font: inherit; color: inherit; cursor: pointer; }
  ul button:hover { background: var(--hover); }
  .err { color: var(--bad); font-size: 12px; margin-left: 4px; }
  .muted { color: var(--muted); }
</style>
