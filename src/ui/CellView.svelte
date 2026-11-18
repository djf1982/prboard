<script lang="ts">
  import type { Cell } from '../fields/types';
  import Icon from './Icon.svelte';
  import { safeHref } from './safeHref';

  // Every string here comes from GitHub or a config. Svelte renders it as text; nothing is parsed as HTML.
  let { cell }: { cell: Cell } = $props();
  const href = $derived(safeHref(cell.href));
</script>

<span class="cell tone-{cell.tone ?? 'neutral'}" title={cell.title}>
  {#if cell.icon}<Icon id={cell.icon} />{/if}
  {#if cell.chips && cell.chips.length}
    <span class="chips">
      {#each cell.chips as chip, i (i)}
        <span class="chip tone-{chip.tone ?? 'neutral'}" title={chip.title}>{chip.text}</span>
      {/each}
    </span>
  {:else if href}
    <a {href} target="_blank" rel="noopener noreferrer">{cell.text}</a>
  {:else}
    <span class="text">{cell.text}</span>
  {/if}
</span>

<style>
  .cell { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-width: 0; }
  .text, a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chips { display: inline-flex; flex-wrap: wrap; gap: 3px; }
  .chip { border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; font-size: 12px; line-height: 18px; white-space: nowrap; }
</style>
