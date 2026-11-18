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
  .cell { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; }
  .text, a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  a { color: inherit; }
  .tone-neutral a { color: var(--fg); }
  a:hover { color: var(--accent); text-decoration: none; }
  .meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; flex: none; }
  .empty { color: var(--faint); }
  .pill { padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 18px;
    background: color-mix(in srgb, currentColor 13%, transparent); border: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
  .pill a { color: inherit; }
  .pill.tone-neutral { color: var(--fg-soft); }
  .clickable.pill:hover { background: color-mix(in srgb, currentColor 22%, transparent); }
  .chips { display: inline-flex; flex-wrap: nowrap; gap: 4px; overflow: hidden; }
  .chip { border: 1px solid var(--border); background: var(--chip-bg); border-radius: 999px; padding: 0 8px; font-size: 12px; line-height: 18px; white-space: nowrap; }
</style>
