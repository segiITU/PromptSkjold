<script lang="ts">
	import { onMount } from 'svelte';
	import Toggle from './Toggle.svelte';
	import { tr } from '../../shared/i18n/store';
	import { loadSettings, saveSettings } from '../../shared/storage';

	let enabled = $state(false);

	onMount(() => {
		void loadSettings().then((settings) => (enabled = settings.officeCheckEnabled));
	});

	// Content scripts follow the stored setting, so saving is enough.
	async function change(checked: boolean): Promise<void> {
		enabled = checked;
		await saveSettings({ officeCheckEnabled: checked });
	}
</script>

<section class="pk-card row">
	<div class="copy">
		<span class="pk-label">{$tr('office.title')}</span>
		<span class="pk-meta">{$tr('office.hint')}</span>
	</div>
	<Toggle checked={enabled} label={$tr('office.title')} onchange={change} />
</section>

<style>
	.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; }
	.copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.pk-label { font-weight: 600; font-size: 13.5px; }
	.pk-meta { color: var(--ink-3); font-size: 12.5px; line-height: 1.4; }
</style>
