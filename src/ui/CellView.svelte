<script lang="ts">
  import type { Cell } from '../fields/types';
  import Icon from './Icon.svelte';
  import { safeHref } from './safeHref';
  import DetailsPopover from './DetailsPopover.svelte';

  // Every string here comes from GitHub or a config. Svelte renders it as text; nothing is parsed as HTML.
  let { cell }: { cell: Cell } = $props();
  const href = $derived(safeHref(cell.href));
</script>

{#snippet body(withLink: boolean)}
  {#if cell.icon}<Icon id={cell.icon} />{/if}
  {#if cell.chips && cell.chips.length}
    <span class="chips">
      {#each cell.chips as chip, i (i)}
        <span class="chip tone-{chip.tone ?? 'neutral'}" title={chip.title}>{chip.text}</span>
      {/each}
    </span>
  {:else if href && withLink}
    <a {href} target="_blank" rel="noopener noreferrer">{cell.text}</a>
  {:else if cell.text}
    <span class="text">{cell.text}</span>
  {:else}
    <span class="empty" aria-label="none">–</span>
  {/if}
  {#if cell.meta}<span class="meta">{cell.meta}</span>{/if}
{/snippet}

{#if cell.details}
  <DetailsPopover details={cell.details} label={cell.text}>
    <span class="cell tone-{cell.tone ?? 'neutral'}" class:pill={cell.pill && cell.text} class:clickable={true}>{@render body(false)}</span>
  </DetailsPopover>
{:else}
  <span class="cell tone-{cell.tone ?? 'neutral'}" class:pill={cell.pill && cell.text} title={cell.title}>{@render body(true)}</span>
{/if}

<style>
  .cell { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; vertical-align: middle; }
  .text, a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  a { color: inherit; }
  .tone-neutral a { color: var(--fg); }
  a:hover { color: var(--accent); text-decoration: none; }
  .meta { color: var(--muted); font-size: 12px; flex: none; }
  .empty { color: var(--faint); }
  /* Status pill: a soft tint in the tone colour, no border, so a row of them stays calm. */
  .pill { height: 22px; padding: 0 8px; border-radius: var(--r-sm); font-size: 12px; font-weight: 500; gap: 5px;
    background: color-mix(in srgb, currentColor 11%, transparent); }
  .pill .text { overflow: hidden; text-overflow: ellipsis; }
  .pill a { color: inherit; }
  .pill.tone-neutral { color: var(--fg-soft); background: var(--chip-bg); }
  .pill.tone-muted { background: var(--chip-bg); }
  .clickable { transition: background-color .12s, box-shadow .12s; }
  .clickable.pill:hover { background: color-mix(in srgb, currentColor 18%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent); }
  .chips { display: inline-flex; flex-wrap: nowrap; gap: 4px; overflow: hidden; }
  .chip { background: var(--chip-bg); border-radius: var(--r-sm); padding: 0 7px; height: 22px; display: inline-flex; align-items: center;
    font-size: 12px; font-weight: 500; white-space: nowrap; color: var(--fg-soft); }
  .chip.tone-good, .chip.tone-warn, .chip.tone-bad { background: color-mix(in srgb, currentColor 11%, transparent); }
  .chip.tone-good { color: var(--good); } .chip.tone-warn { color: var(--warn); } .chip.tone-bad { color: var(--bad); }
</style>
