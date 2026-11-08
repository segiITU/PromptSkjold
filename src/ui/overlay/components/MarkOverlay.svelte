<script lang="ts">
  import { ENTITY_TYPES, type EntityType } from '../../../shared/message-types';
  import type { MessageKey } from '../../../shared/i18n/da';
  import { tr } from '../../../shared/i18n/store';
  import EntityIcon from '../../../shared/design/EntityIcon.svelte';
  import { categoryOf, iconSvg } from '../../../shared/design/categories';

  let {
    snippet,
    onCancel,
    onAdd,
  }: {
    snippet: string;
    onCancel: () => void;
    onAdd: (text: string, type: EntityType) => void;
  } = $props();

  const COMMON_TYPES: readonly EntityType[] = ['PERSON', 'EMAIL', 'PHONE', 'ADDRESS', 'ORGANIZATION', 'CREDIT_CARD'];
  const MORE_TYPES = ENTITY_TYPES.filter((t) => !COMMON_TYPES.includes(t));

  let activeType = $state<EntityType>('ADDRESS');
  let expanded = $state(false);

  const label = (t: EntityType) => $tr(`entity.${t}` as MessageKey);
</script>

<div class="pk-mark" role="dialog" aria-label={$tr('mk.title')}>
  <div class="pk-mark-head">
    <h3>{$tr('mk.title')}</h3>
    <button type="button" class="pk-x" aria-label={$tr('common.close')} onclick={onCancel}>{@html iconSvg('x')}</button>
  </div>

  <div class="pk-mark-body">
    <div class="pk-kicker">{$tr('mk.selection')}</div>
    <div class="pk-snippet" title={snippet}>{snippet}</div>

    <div class="pk-kicker">{$tr('mk.assign')}</div>
    <div class="pk-types" role="group" aria-label={$tr('mk.assign')}>
      {#each expanded ? ENTITY_TYPES : COMMON_TYPES as t (t)}
        <button
          type="button"
          data-cat={categoryOf(t)}
          aria-pressed={activeType === t}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => (activeType = t)}
        >
          <EntityIcon name={categoryOf(t)} size={14} />
          {label(t)}
        </button>
      {/each}
    </div>

    {#if MORE_TYPES.length > 0}
      <button
        type="button"
        class="pk-link"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => (expanded = !expanded)}
      >{expanded ? $tr('mk.fewer') : $tr('mk.more', { n: MORE_TYPES.length })}</button>
    {/if}
  </div>

  <div class="pk-mark-foot">
    <button type="button" class="pk-btn pk-btn-quiet pk-btn-sm" onclick={onCancel}>{$tr('mk.cancel')}</button>
    <button
      type="button"
      class="pk-btn pk-btn-outline pk-btn-sm"
      onmousedown={(e) => e.preventDefault()}
      onclick={() => onAdd(snippet, activeType)}
    >{$tr('mk.add', { type: label(activeType) })}</button>
  </div>
</div>
