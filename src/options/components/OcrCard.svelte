<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Settings } from '../../shared/message-types';
	import { IMAGE_CHECK_TEXT } from '../../shared/image-check-strings';
	import { language, tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		setValue,
		setOffice,
	}: {
		settings: Writable<Settings | null>;
		setValue: (value: boolean) => Promise<void>;
		setOffice: (value: boolean) => Promise<void>;
	} = $props();

	const t = $derived(IMAGE_CHECK_TEXT[$language]);
	let enabled = $derived($settings?.imageCheckEnabled ?? true);
	let officeEnabled = $derived($settings?.officeCheckEnabled ?? false);
</script>

<article class="pk-card" id="ocr-section">
	<CardHeading title={t.title} hint={t.hintShort} />
	<div class="pk-card-body">
		<div class="line">
			<span class="pk-label">{t.title}</span>
			<Toggle checked={enabled} label={t.title} onchange={(checked) => setValue(checked)} />
		</div>
		<p class="pk-fine">{t.description}</p>
		<div class="line office">
			<div>
				<span class="pk-label">{$tr('office.title')}</span>
				<span class="pk-meta">{$tr('office.hint')}</span>
			</div>
			<Toggle checked={officeEnabled} label={$tr('office.title')} onchange={(checked) => setOffice(checked)} />
		</div>
	</div>
</article>

<style>
	.line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.office { margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
</style>
