<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { CancelDetectionBehavior, Settings } from '../../shared/message-types';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		setValue,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: CancelDetectionBehavior) => Promise<void>;
	} = $props();

	let value = $derived<CancelDetectionBehavior>($settings?.cancelDetectionBehavior ?? 'ask');
</script>

<article class="pk-card" id="cancel-detection-section">
	<CardHeading title={$tr('cancel.title')} hint={$tr('cancel.hint')} />
	<div class="pk-row">
		<div>
			<label class="pk-label" for="pk-cancel-select">{$tr('cancel.label')}</label>
			<span class="pk-meta">{$tr('cancel.text')}</span>
		</div>
		<select
			id="pk-cancel-select"
			class="pk-select sel"
			value={value}
			onchange={(event) => setValue(event.currentTarget.value as CancelDetectionBehavior)}
		>
			<option value="ask">{$tr('cancel.ask')}</option>
			<option value="paste-original">{$tr('cancel.paste')}</option>
			<option value="drop">{$tr('cancel.drop')}</option>
		</select>
	</div>
</article>

<style>
	.sel { width: auto; min-width: 190px; }
</style>
