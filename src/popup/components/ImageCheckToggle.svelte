<script lang="ts">
	import { onMount } from 'svelte';
	import Toggle from './Toggle.svelte';
	import { IMAGE_CHECK_TEXT } from '../../shared/image-check-strings';
	import { language } from '../../shared/i18n/store';
	import { loadSettings, saveSettings } from '../../shared/storage';

	const t = $derived(IMAGE_CHECK_TEXT[$language]);
	let enabled = $state(true);

	onMount(() => {
		void loadSettings().then((settings) => (enabled = settings.imageCheckEnabled));
	});

	// Content scripts follow the stored setting, so saving is enough.
	async function change(checked: boolean): Promise<void> {
		enabled = checked;
		await saveSettings({ imageCheckEnabled: checked });
	}
</script>

<section class="pk-card row">
	<div class="copy">
		<span class="pk-label">{t.title}</span>
		<span class="pk-meta">{t.toggleHint}</span>
	</div>
	<Toggle checked={enabled} label={t.title} onchange={change} />
</section>

<style>
	.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; }
	.copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.pk-label { font-weight: 600; font-size: 13.5px; }
	.pk-meta { color: var(--ink-3); font-size: 12.5px; line-height: 1.4; }
</style>
