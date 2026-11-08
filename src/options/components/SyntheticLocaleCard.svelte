<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		setValue,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: Settings['syntheticLocale']) => Promise<void>;
	} = $props();

	let value = $derived<Settings['syntheticLocale']>($settings?.syntheticLocale ?? 'auto');
</script>

<article class="pk-card" id="synthetic-locale-section">
	<CardHeading title={$tr('syn.title')} hint={$tr('syn.hint')} />
	<div class="pk-row">
		<div>
			<label class="pk-label" for="pk-syn-select">{$tr('syn.label')}</label>
			<span class="pk-meta">{$tr('syn.text')}</span>
		</div>
		<select
			id="pk-syn-select"
			class="pk-select sel"
			value={value}
			onchange={(event) => setValue(event.currentTarget.value as Settings['syntheticLocale'])}
		>
			<option value="auto">{$tr('syn.auto')}</option>
			<option value="da">{$tr('syn.da')}</option>
			<option value="en">{$tr('syn.en')}</option>
		</select>
	</div>
</article>

<style>
	.sel { width: auto; min-width: 150px; }
</style>
