<script lang="ts">
  import { tr, trn } from '../../../shared/i18n/store';
  import { LOGO_DATA_URI } from '../../shared/page-assets.generated';
  import { iconSvg } from '../../../shared/design/categories';

  let { totalCount, timingMs, onClose }: { totalCount: number; timingMs?: number; onClose: () => void } = $props();
</script>

<header class="pk-head">
  <img class="pk-logo" src={LOGO_DATA_URI} alt="" width="40" height="40" />
  <div class="pk-head-text">
    <h2 class="pk-title" id="pk-title">{$tr('ov.title')}</h2>
    <p class="pk-sub" id="pk-sub">
      {$trn('ov.sub', totalCount)}
      {#if timingMs !== undefined}
        {$tr('ov.subTiming', { ms: timingMs })}
      {/if}
    </p>
  </div>
  <button
    type="button"
    class="pk-x"
    title={$tr('ov.closeTitle')}
    aria-label={$tr('ov.close')}
    onclick={onClose}
  >{@html iconSvg('x')}</button>
</header>
