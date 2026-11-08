<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { GroupName, Settings } from '../../shared/message-types';
	import type { MessageKey } from '../../shared/i18n/da';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Segmented from '../../popup/components/Segmented.svelte';

	let {
		settings,
		groupNames,
		setSensitivityMode,
		setGlobalThreshold,
		setGroupThreshold,
	}: {
		settings: Writable<Settings | null>;
		groupNames: readonly GroupName[];
		setSensitivityMode: (mode: Settings['sensitivityMode']) => Promise<void>;
		setGlobalThreshold: (value: number) => Promise<void>;
		setGroupThreshold: (group: GroupName, value: number) => Promise<void>;
	} = $props();

	let mode = $derived($settings?.sensitivityMode ?? 'global');
	let globalValue = $derived($settings?.minConfidence ?? 0.5);
	let groupThresholds = $derived($settings?.groupThresholds ?? {});
</script>

<article class="pk-card" id="sensitivity-section">
	<CardHeading title={$tr('sens.title')} hint={$tr('sens.hint')} />

	<div class="pk-card-body">
		<Segmented
			ariaLabel={$tr('sens.modeAria')}
			value={mode}
			options={[{ value: 'global', label: $tr('sens.global') }, { value: 'individual', label: $tr('sens.individual') }]}
			onchange={(next) => setSensitivityMode(next)}
		/>

		{#if mode === 'global'}
			<p class="pk-fine">{$tr('sens.textGlobal')}</p>
			<div class="slider">
				<div class="head">
					<label class="pk-label" for="pk-sens-global">{$tr('sens.title')}</label>
					<span class="pk-fine">{Math.round(globalValue * 100)} %</span>
				</div>
				<input
					id="pk-sens-global"
					class="pk-range"
					type="range"
					min="0"
					max="100"
					value={Math.round(globalValue * 100)}
					oninput={(event) => setGlobalThreshold(Number(event.currentTarget.value) / 100)}
					aria-label={$tr('sens.globalAria')}
				/>
				<div class="head pk-fine"><span>{$tr('set.sensFew')}</span><span>{$tr('set.sensMore')}</span></div>
			</div>
		{:else}
			<p class="pk-fine">{$tr('sens.textIndividual')}</p>
			<div class="groups">
				{#each groupNames as group (group)}
					{@const stored = groupThresholds[group]}
					{@const pos = stored !== undefined ? stored : 0.5}
					{@const name = $tr(`group.${group}` as MessageKey)}
					<div class="group">
						<span class="pk-label">{name}</span>
						<input
							class="pk-range"
							type="range"
							min="0"
							max="100"
							value={Math.round(pos * 100)}
							oninput={(event) => setGroupThreshold(group, Number(event.currentTarget.value) / 100)}
							aria-label={$tr('sens.groupAria', { group: name })}
						/>
						<span class="pk-fine pct">{Math.round(pos * 100)} %</span>
					</div>
				{/each}
			</div>
			<div class="head pk-fine"><span>{$tr('set.sensFew')}</span><span>{$tr('set.sensMore')}</span></div>
		{/if}
	</div>
</article>

<style>
	.slider { display: grid; gap: 6px; }
	.head { display: flex; justify-content: space-between; align-items: center; }
	.groups { display: grid; gap: 4px; }
	.group { display: grid; grid-template-columns: minmax(110px, 170px) 1fr 44px; align-items: center; gap: 14px; padding: 6px 0; border-top: 1px solid var(--line); }
	.group:first-child { border-top: 0; }
	.pct { text-align: right; font-variant-numeric: tabular-nums; }
	@media (max-width: 640px) { .group { grid-template-columns: 1fr 44px; } .group .pk-label { grid-column: 1 / -1; } }
</style>
