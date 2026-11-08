<script lang="ts">
  import type { EntityType } from '../../../shared/message-types';
  import { tr } from '../../../shared/i18n/store';
  import { categoryOf, iconSvg } from '../../../shared/design/categories';
  import type { MessageKey } from '../../../shared/i18n/da';
  import type { OverlayModel } from '../overlay-model';
  import { truncate } from '../overlay-model';
  import EntityIcon from '../../../shared/design/EntityIcon.svelte';
  import Finding from './Finding.svelte';

  let { model }: { model: OverlayModel } = $props();

  // svelte-ignore state_referenced_locally
  const { spanStates, manualSpans, mainIndices, codeBlockIndices, view } = model;
</script>

<ul id="pg-entities" aria-label={$tr('ov.items')}>
  {#each $mainIndices as i (i)}
    <Finding
      state={$spanStates[i]}
      index={i}
      token={$view.tokens[i]}
      belowThreshold={model.isBelowThreshold($spanStates[i])}
      onReplace={(n) => model.replaceIndex(n)}
      onKeep={(n) => model.keepIndex(n)}
      onAllow={(n) => model.allowAlways(n)}
      onPattern={(n) => model.allowPattern(n)}
      onRetype={(n, type: EntityType) => model.retype(n, type)}
    />
  {/each}

  {#each $manualSpans as span, i (i)}
    {@const cat = categoryOf(span.entity_type)}
    <li class="pk-manual" data-cat={cat}>
      <div>
        <span class="pk-kind">
          <EntityIcon name={cat} />
          <span>{$tr(`entity.${span.entity_type}` as MessageKey)}</span>
        </span>
        <div class="pk-fi-val" title={span.text}>{truncate(span.text, 42)}</div>
        <small>{$tr('ov.manualBadge')}</small>
      </div>
      <button
        type="button"
        class="pk-x"
        aria-label={$tr('ov.manualRemove', { v: truncate(span.text, 24) })}
        onclick={() => model.removeManual(i)}
      >{@html iconSvg('x')}</button>
    </li>
  {/each}
</ul>

{#if $codeBlockIndices.length > 0}
  <details class="pk-code">
    <summary>{$tr('ov.codeBlocks', { n: $codeBlockIndices.length })}</summary>
    <ul>
      {#each $codeBlockIndices as i (i)}
        <Finding
          state={$spanStates[i]}
          index={i}
          token={$view.tokens[i]}
          belowThreshold={model.isBelowThreshold($spanStates[i])}
          onReplace={(n) => model.replaceIndex(n)}
          onKeep={(n) => model.keepIndex(n)}
          onAllow={(n) => model.allowAlways(n)}
          onPattern={(n) => model.allowPattern(n)}
          onRetype={(n, type: EntityType) => model.retype(n, type)}
        />
      {/each}
    </ul>
  </details>
{/if}
