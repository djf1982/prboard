<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CellDetails } from '../fields/types';
  import { safeHref } from './safeHref';
  import { nextPopoverId, placeNear } from './popover';

  let { details, label, children }: { details: CellDetails; label: string; children: Snippet } = $props();

  const id = nextPopoverId('details');
  let trigger: HTMLButtonElement | undefined = $state();
  let pop: HTMLDivElement | undefined = $state();
  let open = $state(false);
  let top = $state(0);
  let left = $state(0);
  function show() {
    if (!pop || !trigger) return;
    if (!open) {
      pop.showPopover();
      open = true;
      ({ top, left } = placeNear(trigger, pop));
    }
  }
  function hide() {
    if (open) pop?.hidePopover();
    open = false;
  }
  function onClick() {
    if (open) hide();
    else show();
  }

  // An open popover closes on Esc, a click outside, scroll outside it, or resize.
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop?.contains(t) && !trigger?.contains(t)) hide();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { hide(); trigger?.focus(); } };
    const onScroll = (e: Event) => { if (!pop?.contains(e.target as Node)) hide(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
    };
  });

  const link = $derived(details.link ? safeHref(details.link.href) : undefined);
</script>

<button
  class="trigger"
  bind:this={trigger}
  aria-expanded={open}
  aria-controls={id}
  aria-label="{label}: show details"
  onclick={onClick}
>{@render children()}</button>

<div class="pop" {id} popover="manual" bind:this={pop} style:top="{top}px" style:left="{left}px">
  {#if details.heading || link}
    <div class="head">
      {#if details.heading}<span class="heading">{details.heading}</span>{/if}
      {#if link && details.link}<a href={link} target="_blank" rel="noopener noreferrer">{details.link.text} ↗</a>{/if}
    </div>
  {/if}
  <div class="groups">
    {#each details.groups as g, gi (gi)}
      <details class="group tone-{g.tone ?? 'neutral'}" open={!g.collapsed}>
        <summary><span class="dot"></span><span class="glabel">{g.label}</span><span class="gcount">{g.items.length}</span></summary>
        <ul>
          {#each g.items as item, ii (ii)}
            {@const href = safeHref(item.href)}
            <li>
              {#if href}<a {href} target="_blank" rel="noopener noreferrer" class="name">{item.text}</a>{:else}<span class="name">{item.text}</span>{/if}
              {#if item.meta}<span class="meta">{item.meta}</span>{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  </div>
  {#if details.note}<p class="note">{details.note}</p>{/if}
</div>

<style>
  .trigger { all: unset; cursor: pointer; display: inline-flex; max-width: 100%; border-radius: 999px; }
  .trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pop { position: fixed; inset: auto; margin: 0; padding: 0; width: min(420px, calc(100vw - 16px)); max-height: min(70vh, 560px); overflow: auto;
    background: var(--bg-raised); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow);
    font-size: 13px; text-transform: none; letter-spacing: normal; font-weight: 400; white-space: normal; }
  .head { position: sticky; top: 0; display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 10px 14px;
    background: var(--bg-raised); border-bottom: 1px solid var(--border-soft); }
  .heading { font-weight: 600; font-variant-numeric: tabular-nums; }
  .head a { font-size: 12px; white-space: nowrap; }
  .groups { padding: 6px 0; }
  .group summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 6px 14px; font-weight: 600; font-size: 12px; }
  .group summary::-webkit-details-marker { display: none; }
  .group summary:hover { background: var(--hover); }
  .group summary::after { content: '▸'; margin-left: auto; color: var(--muted); font-size: 10px; transition: transform .12s; }
  .group[open] summary::after { transform: rotate(90deg); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
  .glabel { color: var(--fg); }
  .gcount { color: var(--muted); font-weight: 500; background: var(--chip-bg); border-radius: 999px; padding: 0 7px; font-size: 11px; }
  ul { list-style: none; margin: 0 0 4px; padding: 0; }
  li { display: flex; align-items: baseline; gap: 8px; padding: 3px 14px 3px 30px; min-width: 0; }
  li:hover { background: var(--row-hover); }
  .name { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  a.name:hover { color: var(--accent); }
  .meta { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
  .note { margin: 0; padding: 8px 14px 10px; color: var(--muted); font-size: 11px; border-top: 1px solid var(--border-soft); }
</style>
