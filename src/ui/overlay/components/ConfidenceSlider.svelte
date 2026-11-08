<script lang="ts">
  import { tr } from '../../../shared/i18n/store';

  let {
    value,
    onChange,
  }: { value: number; onChange: (v: number) => void } = $props();
</script>

<div class="pk-conf-row">
  <label for="pg-threshold">
    <span>{$tr('ov.minConfidence')}</span>
    <span>{Math.round(value * 100)} %</span>
  </label>
  <input
    id="pg-threshold"
    type="range"
    min="0"
    max="100"
    value={Math.round(value * 100)}
    oninput={(e) => onChange(parseInt(e.currentTarget.value, 10) / 100)}
  />
</div>
