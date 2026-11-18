<script lang="ts">
  // The prboard wordmark: the name, with a green status dot as its full stop. Type only; no badge or gradient.
  let { size = 14 }: { size?: number } = $props();
</script>

<span class="wordmark" style:font-size="{size}px">prboard<span class="dot" aria-hidden="true"></span></span>

<style>
  .wordmark { display: inline-flex; align-items: baseline; font-weight: 600; letter-spacing: -.03em; color: var(--fg); line-height: 1; }
  .dot { width: .3em; height: .3em; border-radius: 50%; background: var(--good); margin-left: .1em; }
</style>
