<script lang="ts">
  import type { PullRequestNode } from '../github/types';
  import { availableActions } from '../actions/registry';
  import type { ActionDef } from '../actions/types';
  import type { Client } from '../github/client';
  import Icon from './Icon.svelte';

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
    const width = Math.max(menu.offsetWidth, 280);
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
  <button class="trigger" class:busy bind:this={trigger} popovertarget={menuId} aria-haspopup="menu" aria-label={busy ? 'Working…' : 'Actions'} title={busy ? 'Working…' : 'Actions'} disabled={busy}>
    {#if busy}<span class="spinner" aria-hidden="true"></span>{:else}<Icon id="more" />{/if}
  </button>
  <div class="menu" id={menuId} popover="auto" bind:this={menu} ontoggle={place} style:top="{top}px" style:left="{left}px">
    <ul role="menu">
      {#each actions as action, i (action.id)}
        {@const choices = action.choices?.(pr) ?? []}
        {#if i > 0 && (choices.length > 1 || (actions[i - 1]?.choices?.(pr) ?? []).length > 1)}<li role="separator" class="sep"></li>{/if}
        {#if choices.length > 1}
          <li role="none" class="item group">
            <span class="ico"><Icon id={action.icon ?? 'dot'} /></span>
            <span class="body">
              <span class="label">{action.label}</span>
              <span class="desc">{action.description}</span>
              <span class="seg" role="group" aria-label={action.label}>
                {#each choices as c (c.id)}
                  <button role="menuitem" title="{action.label}: {c.label}" onclick={() => run(action, c.id)}>{c.label}</button>
                {/each}
              </span>
            </span>
          </li>
        {:else}
          <li role="none">
            <button role="menuitem" class="item" onclick={() => run(action, choices[0]?.id)}>
              <span class="ico"><Icon id={action.icon ?? 'dot'} /></span>
              <span class="body">
                <span class="label">{action.label}</span>
                <span class="desc">{action.description}</span>
              </span>
            </button>
          </li>
        {/if}
      {/each}
    </ul>
  </div>
{:else}
  <span class="muted" aria-label="No actions">–</span>
{/if}
{#if error}<span class="err" title={error}>failed</span>{/if}

<style>
  .trigger { width: 28px; height: 26px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--muted); }
  :global(tr:hover) .trigger, .trigger:hover { border-color: var(--border); background: var(--bg-raised); color: var(--fg); }
  .trigger:focus-visible { border-color: var(--border); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
  .trigger:has(+ .menu:popover-open) { background: var(--hover); border-color: var(--border-strong); color: var(--fg); box-shadow: none; }
  .spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border-strong); border-top-color: var(--accent); animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .menu { position: fixed; inset: auto; margin: 0; padding: 4px; background: var(--bg-raised); color: var(--fg); border: 1px solid var(--border);
    border-radius: var(--r-md); box-shadow: var(--shadow); width: 280px; text-align: left; }
  .menu:popover-open { animation: pop .14s var(--ease); }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
  ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; }
  li { display: block; }
  .sep { height: 1px; background: var(--border-soft); margin: 4px -4px; }
  /* One row: icon, then the label with a short description under it. */
  .item { display: flex; align-items: flex-start; gap: 10px; width: 100%; height: auto; padding: 7px 10px 7px 8px; text-align: left;
    background: none; border: 0; border-radius: var(--r-sm); white-space: normal; font-weight: 400; color: var(--fg-soft); }
  button.item:hover:not(:disabled), button.item:focus-visible { background: var(--hover); color: var(--fg); outline: none; }
  button.item:hover .ico, button.item:focus-visible .ico { color: var(--fg); }
  .ico { display: grid; place-items: center; width: 16px; height: 18px; flex: none; color: var(--muted); }
  .body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .label { font-size: 13px; font-weight: 500; line-height: 18px; color: var(--fg); }
  .desc { font-size: 11.5px; line-height: 16px; color: var(--muted); }
  /* Choices (for example merge methods) as one segmented control. */
  .seg { display: flex; margin-top: 8px; border: 1px solid var(--border); border-radius: var(--r-sm); overflow: hidden; background: var(--bg-sunken); }
  .seg button { flex: 1; height: 26px; padding: 0 8px; border: 0; border-radius: 0; background: transparent; font-size: 12px; font-weight: 500; color: var(--fg-soft); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover:not(:disabled), .seg button:focus-visible { background: var(--hover); color: var(--fg); outline: none; }
  .err { color: var(--bad); font-size: 12px; margin-left: 4px; }
  .muted { color: var(--faint); padding-right: 10px; }
</style>
