<script lang="ts">
	import type { VaultModel } from '../popup-model.svelte';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from './CardHeading.svelte';
	import Segmented from './Segmented.svelte';
	import Toggle from './Toggle.svelte';

	let { memoryEnabled, consistentReplacementMode, mappingCount, setMemoryEnabled, setReplacementMode, openVaultOptions }: Pick<VaultModel, 'memoryEnabled' | 'consistentReplacementMode' | 'mappingCount' | 'setMemoryEnabled' | 'setReplacementMode' | 'openVaultOptions'> = $props();
</script>

<article class="pk-card">
	<CardHeading title={$tr('vault.title')} />
	<div class="pk-row">
		<span class="pk-label">{$tr('vault.memory')}</span>
		<Toggle size="sm" checked={$memoryEnabled} label={$tr('vault.memory')} onchange={(checked) => setMemoryEnabled(checked)} />
	</div>
	<div class="pk-divider"></div>
	<div class="pk-row">
		<span class="pk-label">{$tr('vault.replacement')}</span>
		<Segmented
			ariaLabel={$tr('vault.modeAria')}
			value={$consistentReplacementMode ? 'placeholder' : 'synthetic'}
			options={[{ value: 'placeholder', label: $tr('vault.placeholder') }, { value: 'synthetic', label: $tr('vault.synthetic') }]}
			onchange={(mode) => setReplacementMode(mode)}
		/>
	</div>
	<div class="pk-divider"></div>
	<button type="button" class="pk-link-row" onclick={openVaultOptions}>
		<span class="pk-label">{$tr('vault.manage')}</span>
		<span class="pk-right">{$tr('vault.saved', { n: $mappingCount })}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></span>
	</button>
</article>
