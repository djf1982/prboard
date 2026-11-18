<script lang="ts">
  import type { IconId } from '../fields/types';
  let { id }: { id: IconId } = $props();
  // A fixed icon set. Configs and GitHub data can only pick an id, never a path.
  const PATHS: Record<IconId, string> = {
    check: 'M3 8.5l3 3 7-7',
    x: 'M4 4l8 8M12 4l-8 8',
    dot: 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    clock: 'M8 2a6 6 0 1 0 0 12A6 6 0 1 0 8 2M8 5v3.5l2.5 1.5',
    merge: 'M5 3v10M5 6c0 3 6 2 6 6M5 3a1 1 0 1 0 0 .1M11 13a1 1 0 1 0 0 .1',
    draft: 'M3 13l1-3 7-7 2 2-7 7-3 1z',
    comment: 'M2.5 3.5h11v7h-6l-3 3v-3h-2z',
    alert: 'M8 2l6.5 11h-13zM8 6.5v3M8 11.5v.5',
    branch: 'M5 2.5v11M11 2.5v3c0 3-6 2-6 5',
    queue: 'M3 4h10M3 8h10M3 12h6',
    eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
  };
</script>

<svg class="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  <path d={PATHS[id]} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
  .icon { flex: none; vertical-align: -2px; }
</style>
