<script lang="ts">
  import { ENTITY_TYPES, type EntityType } from '../../../shared/message-types';
  import type { MessageKey } from '../../../shared/i18n/da';
  import { tr } from '../../../shared/i18n/store';
  import { categoryOf } from '../../../shared/design/categories';
  import EntityIcon from '../../../shared/design/EntityIcon.svelte';
  import { truncate, type SpanState } from '../overlay-model';

  let {
    state,
    index,
    token,
    belowThreshold,
    onReplace,
    onKeep,
    onAllow,
    onPattern,
    onRetype,
  }: {
    state: SpanState;
    index: number;
    token: string | undefined;
    belowThreshold: boolean;
    onReplace: (i: number) => void;
    onKeep: (i: number) => void;
    onAllow: (i: number) => void;
    onPattern: (i: number) => void;
    onRetype: (i: number, type: EntityType) => void;
  } = $props();

  const cat = $derived(categoryOf(state.entityType));
  const pct = $derived(Math.round(state.span.score * 100));
  const typeLabel = (t: EntityType) => $tr(`entity.${t}` as MessageKey);
</script>

<li class={['pk-fi', !state.enabled && 'off']} data-cat={cat} id={`pk-fi-${index}`}>
  <div class="pk-fi-top">
    <span class="pk-kind">
      <EntityIcon name={cat} />
      {#if state.whitelisted}
        <span>{typeLabel(state.entityType)}</span>
      {:else}
        <select class="pk-type" aria-label={$tr('act.type')} value={state.entityType} onchange={(e) => onRetype(index, e.currentTarget.value as EntityType)}>
          {#each ENTITY_TYPES as type (type)}
            <option value={type}>{typeLabel(type)}</option>
          {/each}
        </select>
      {/if}
    </span>
    {#if belowThreshold}
      <span class="pk-conf low">{$tr('common.confidenceLow', { p: pct })}</span>
    {/if}
  </div>

  <div class="pk-fi-val" title={state.span.text}>{truncate(state.span.text, 42)}</div>

  {#if state.whitelisted}
    <div class="pk-fi-ph">{$tr('fi.allowNote')}</div>
  {:else if state.enabled && token}
    <div class="pk-fi-ph">{$tr('fi.becomes')} <span class="pk-tag">{token}</span></div>
  {/if}

  <div class="pk-seg" role="group" aria-label={$tr('act.group', { v: truncate(state.span.text, 24) })}>
    <button type="button" class="pk-act-replace" aria-pressed={state.enabled && !state.whitelisted} disabled={state.whitelisted} onclick={() => onReplace(index)}>{$tr('act.replace')}</button>
    <button type="button" class="pk-act-keep" aria-pressed={!state.enabled && !state.whitelisted} disabled={state.whitelisted} onclick={() => onKeep(index)}>{$tr('act.keep')}</button>
    <button type="button" aria-pressed={state.whitelisted} disabled={state.whitelisted} onclick={() => onAllow(index)}>{$tr('act.allow')}</button>
  </div>
  {#if !state.whitelisted}
    <!-- Advanced: shown on hover or keyboard focus so the card stays quiet. -->
    <button type="button" class="pk-link pk-more" onclick={() => onPattern(index)}>{$tr('act.pattern')}</button>
  {/if}
</li>
