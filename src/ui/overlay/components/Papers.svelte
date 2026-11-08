<script lang="ts">
  import { tr } from '../../../shared/i18n/store';
  import type { ViewParagraph } from '../overlay-view';
  import LinesMotif from '../../shared/LinesMotif.svelte';

  let {
    original,
    result,
    anyEnabled,
    onToggleSpan,
  }: {
    original: ViewParagraph[];
    result: ViewParagraph[];
    anyEnabled: boolean;
    onToggleSpan?: (index: number) => void;
  } = $props();

  function handleClick(event: MouseEvent) {
    if (!onToggleSpan) return;
    const target = event.target as HTMLElement | null;
    const hit = target?.closest('[data-pg-span-index]') as HTMLElement | null;
    if (!hit) return;
    const idx = Number.parseInt(hit.getAttribute('data-pg-span-index') ?? '', 10);
    if (!Number.isNaN(idx)) onToggleSpan(idx);
  }
</script>

<article class="pk-paper" aria-labelledby="pk-h-original">
  <h3 class="pk-paper-h" id="pk-h-original">{$tr('ov.paneMarked')}</h3>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="pk-letter pg-original-text" id="pg-original" onclick={handleClick} role="presentation">
    {#each original as para, i (i)}
      <p>{@html para.html}</p>
    {/each}
  </div>
</article>

<article class="pk-paper pk-paper-out" aria-labelledby="pk-h-result">
  <h3 class="pk-paper-h" id="pk-h-result">{$tr('ov.paneResult')}</h3>
  <div class="pk-letter" id="pg-preview">
    {#each result as para, i (i)}
      <p>{@html para.html}</p>
    {/each}
  </div>
  {#if !anyEnabled}
    <div class="pk-empty" role="status">
      <LinesMotif state="empty" small />
      <p>{$tr('ov.emptyHint')}</p>
    </div>
  {/if}
</article>
