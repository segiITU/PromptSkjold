<script lang="ts">
	import { onMount } from 'svelte';
	import Toggle from '../popup/components/Toggle.svelte';
	import type { GroupName, Settings } from '../shared/message-types';
	import { GROUP_DEFAULT_ON } from '../shared/category-groups';
	import { loadSettings, saveSettings } from '../shared/storage';
	import { FLAG_GROUPS, UI, type Lang } from './content';

	let { lang }: { lang: Lang } = $props();

	let imageCheck = $state(true);
	let officeCheck = $state(false);
	let groups: Partial<Record<GroupName, boolean>> = $state({});
	let replaceLanguage: Settings['syntheticLocale'] = $state('auto');

	onMount(() => {
		void loadSettings().then((settings) => {
			imageCheck = settings.imageCheckEnabled;
			officeCheck = settings.officeCheckEnabled;
			groups = { ...settings.groupsEnabled };
			replaceLanguage = settings.syntheticLocale;
		});
	});

	// Detection follows the stored settings, so saving is enough.
	async function setImageCheck(checked: boolean): Promise<void> {
		imageCheck = checked;
		await saveSettings({ imageCheckEnabled: checked });
	}

	async function setOfficeCheck(checked: boolean): Promise<void> {
		officeCheck = checked;
		await saveSettings({ officeCheckEnabled: checked });
	}

	async function setGroup(id: GroupName, checked: boolean): Promise<void> {
		groups = { ...groups, [id]: checked };
		await saveSettings({ groupsEnabled: { ...GROUP_DEFAULT_ON, ...groups } as Record<GroupName, boolean> });
	}

	async function setReplaceLanguage(value: Settings['syntheticLocale']): Promise<void> {
		replaceLanguage = value;
		await saveSettings({ syntheticLocale: value });
	}
</script>

<div class="controls">
	<div class="row">
		<div class="copy"><span class="title">{UI.imageCheck[lang]}</span><span class="hint">{UI.imageCheckHint[lang]}</span></div>
		<Toggle checked={imageCheck} label={UI.imageCheck[lang]} onchange={setImageCheck} />
	</div>

	<div class="row">
		<div class="copy"><span class="title">{UI.officeCheck[lang]}</span><span class="hint">{UI.officeCheckHint[lang]}</span></div>
		<Toggle checked={officeCheck} label={UI.officeCheck[lang]} onchange={setOfficeCheck} />
	</div>

	<h3>{UI.flagTitle[lang]}</h3>
	{#each FLAG_GROUPS as group (group.id)}
		<div class="row">
			<div class="copy"><span class="title">{group.label[lang]}</span><span class="hint">{group.covers[lang]}</span></div>
			<Toggle checked={groups[group.id] ?? GROUP_DEFAULT_ON[group.id]} label={group.label[lang]} onchange={(checked) => setGroup(group.id, checked)} />
		</div>
	{/each}

	<div class="row">
		<div class="copy"><span class="title">{UI.replaceLanguage[lang]}</span></div>
		<select value={replaceLanguage} aria-label={UI.replaceLanguage[lang]} onchange={(event) => setReplaceLanguage(event.currentTarget.value as Settings['syntheticLocale'])}>
			<option value="auto">{UI.replaceAuto[lang]}</option>
			<option value="da">{UI.replaceDa[lang]}</option>
			<option value="en">{UI.replaceEn[lang]}</option>
		</select>
	</div>

	<aside class="pin"><strong>{UI.pinTitle[lang]}</strong><p>{UI.pinBody[lang]}</p></aside>
</div>

<style>
	.controls { display: flex; flex-direction: column; gap: 2px; }
	h3 { margin: 14px 0 4px; font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.04em; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; border-top: var(--border-hairline); }
	.copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.title { font-size: 14px; font-weight: 500; }
	.hint { color: var(--color-muted); font-size: 12px; }
	select { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 8px; border: var(--border-hairline); background: transparent; color: var(--color-ink); }
	.pin { margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: var(--color-card); border: var(--border-hairline); font-size: 13px; }
	.pin p { margin: 4px 0 0; color: var(--color-muted); line-height: 1.5; }
</style>
