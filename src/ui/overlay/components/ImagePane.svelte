<script lang="ts">
  import { tr } from '../../../shared/i18n/store';
  import { categoryOf } from '../../../shared/design/categories';
  import type { OverlayModel } from '../overlay-model';

  let { model }: { model: OverlayModel } = $props();

  // The model lives as long as the overlay, so reading its stores once is safe.
  // svelte-ignore state_referenced_locally
  const { spanStates } = model;
  // svelte-ignore state_referenced_locally
  const image = model.options.image!;

  let active = $state<'original' | 'blacked'>('original');
  let natural = $state({ width: 0, height: 0 });

  function onLoad(event: Event): void {
    const img = event.currentTarget as HTMLImageElement;
    natural = { width: img.naturalWidth, height: img.naturalHeight };
  }

  function pct(value: number, of: number): string {
    return `${(value / of) * 100}%`;
  }
</script>

<div class="pk-image-wrap">
  <div class="pk-image-tabs" role="group" aria-label={$tr('ov.paneImage')}>
    <button type="button" aria-pressed={active === 'original'} onclick={() => (active = 'original')}
      >{$tr('img.original')}</button
    >
    <button type="button" aria-pressed={active === 'blacked'} onclick={() => (active = 'blacked')}
      >{$tr('img.blacked')}</button
    >
  </div>
  <div class="pk-image-stage">
    <img src={image.url} alt={$tr('img.alt')} onload={onLoad} />
    {#if natural.width > 0}
      {#each $spanStates as state, index (index)}
        {#each image.boxesFor(state.span) as box}
          {@const style = `left:${pct(box.x0, natural.width)};top:${pct(box.y0, natural.height)};width:${pct(box.x1 - box.x0, natural.width)};height:${pct(box.y1 - box.y0, natural.height)}`}
          {#if active === 'original'}
            <button
              type="button"
              class={['pg-highlight', 'pk-image-box', !state.enabled && 'pk-off']}
              data-cat={categoryOf(state.entityType)}
              {style}
              title={state.span.text}
              aria-label={state.enabled
                ? $tr('img.keep', { v: state.span.text })
                : $tr('img.include', { v: state.span.text })}
              onclick={() => model.toggleWithNotice(index, !state.enabled)}
            ></button>
          {:else if state.enabled}
            <div class="pk-image-box pk-image-box-black" {style}></div>
          {/if}
        {/each}
      {/each}
    {/if}
  </div>
</div>
