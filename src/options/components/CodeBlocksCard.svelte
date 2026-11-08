<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		setValue,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: boolean) => Promise<void>;
	} = $props();

	let value = $derived($settings?.skipCodeBlocks ?? false);
</script>

<article class="pk-card" id="code-blocks-section">
	<CardHeading title={$tr('code.title')} hint={$tr('code.hint')} />
	<div class="pk-row">
		<div>
			<span class="pk-label">{$tr('code.label')}</span>
			<span class="pk-meta">{$tr('code.text')}</span>
		</div>
		<Toggle size="sm" checked={value} label={$tr('code.label')} onchange={(checked) => setValue(checked)} />
	</div>
</article>
