<script lang="ts" module>
  import type { IconId } from '../fields/types';
  /** Icons for the app chrome. Fields can only use IconId. */
  export type UiIconId = 'refresh' | 'columns' | 'sliders' | 'code' | 'more' | 'chevron' | 'chevron-down' | 'search' | 'external' | 'logout'
    | 'plus' | 'close' | 'grip' | 'eye-off' | 'group' | 'arrow-up' | 'arrow-down' | 'arrow-left' | 'arrow-right' | 'inbox' | 'github' | 'info' | 'lock' | 'download' | 'upload' | 'link';
</script>

<script lang="ts">
  let { id, size = 14 }: { id: IconId | UiIconId; size?: number } = $props();
  // A fixed icon set. Configs and GitHub data can only pick an id, never a path.
  const PATHS: Record<IconId | UiIconId, string> = {
    check: 'M3.5 8.5l3 3 6-7',
    x: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    dot: 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    clock: 'M8 2.25a5.75 5.75 0 1 0 0 11.5A5.75 5.75 0 1 0 8 2.25M8 5v3.25l2.25 1.5',
    merge: 'M5 3.5v9M5 6.5c0 3 6 2 6 6M5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3M11 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    draft: 'M3 13l1-3 7-7 2 2-7 7-3 1z',
    comment: 'M2.5 3.5h11v7h-6l-3 3v-3h-2z',
    alert: 'M8 2l6.5 11h-13zM8 6.5v3M8 11.5v.5',
    branch: 'M5 2.5v11M11 2.5v3c0 3-6 2-6 5',
    queue: 'M3 4h10M3 8h10M3 12h6',
    eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3',
    refresh: 'M13 3.5v3h-3M12.6 6.5A5 5 0 1 0 13 9',
    columns: 'M2.5 3.5h11v9h-11zM6.25 3.5v9M9.75 3.5v9',
    sliders: 'M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6M10.5 3v3M5.5 10v3',
    code: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
    more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
    chevron: 'M6 4l4 4-4 4',
    'chevron-down': 'M4 6l4 4 4-4',
    search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9M10.5 10.5l3 3',
    external: 'M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3.5h-9v-9H6',
    logout: 'M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6.5',
    plus: 'M8 3v10M3 8h10',
    close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
    'eye-off': 'M2 2l12 12M6.5 6.6a2 2 0 0 0 2.9 2.9M4.2 4.4C2.5 5.6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.4-.4 3.4-1M7 3.6c.3 0 .7-.1 1-.1 4 0 6.5 4.5 6.5 4.5s-.5 1-1.5 2.1',
    group: 'M2.5 3.5h11M4.5 6.5h9M4.5 9.5h9M2.5 12.5h11',
    'arrow-up': 'M8 13V3M4 7l4-4 4 4',
    'arrow-down': 'M8 3v10M4 9l4 4 4-4',
    'arrow-left': 'M13 8H3M7 4L3 8l4 4',
    'arrow-right': 'M3 8h10M9 4l4 4-4 4',
    inbox: 'M2 9.5l2-6h8l2 6v3.5H2zM2 9.5h3.5l1 1.5h3l1-1.5H14',
    github: 'M6 13c-3 1-3-1.5-4.5-2M10 14.5v-2.3c0-.7 0-1.2-.4-1.6 2-.2 4-1 4-4.4 0-.9-.3-1.7-.9-2.4.1-.6.1-1.4-.1-2.3 0 0-.8-.2-2.4.9a8 8 0 0 0-4.4 0C4.2.3 3.4.5 3.4.5c-.2.9-.2 1.7-.1 2.3-.6.7-.9 1.5-.9 2.4 0 3.4 2 4.2 4 4.4-.4.4-.4.9-.4 1.6v2.3',
    info: 'M8 2.25a5.75 5.75 0 1 0 0 11.5A5.75 5.75 0 1 0 8 2.25M8 7.25V11M8 5v.01',
    lock: 'M3.5 7.5h9v6h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5',
    download: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11',
    upload: 'M8 10.5v-8M4.5 6L8 2.5 11.5 6M2.5 13.5h11',
    link: 'M7 9a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.2l-1 1M9 7a3 3 0 0 0-4.2-.3l-2 2a3 3 0 0 0 4.2 4.2l1-1',
  };
  const heavy = new Set(['more', 'grip']);
</script>

<svg class="icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
  <path d={PATHS[id]} fill="none" stroke="currentColor" stroke-width={heavy.has(id) ? 2.6 : 1.5} stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
  .icon { flex: none; display: inline-block; vertical-align: -2px; }
</style>
