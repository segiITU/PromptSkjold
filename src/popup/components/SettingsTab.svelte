<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { FeedbackCounts } from '../popup-model.svelte';
	import type { NerModelKey, Settings } from '../../shared/message-types';
	import type { NerModelChoice } from '../../shared/constants';
	import type { LanguagePreference } from '../../shared/i18n/core';
	import { chooseLanguage, languagePreference, tr } from '../../shared/i18n/store';
	import Toggle from './Toggle.svelte';
	import Segmented from './Segmented.svelte';
	import LegalCard from './LegalCard.svelte';
	import CardHeading from './CardHeading.svelte';

	let {
		minConfidence,
		debug,
		clipboardInterceptEnabled,
		nerModel,
		nerModelChoice,
		nerModelChoices,
		sensitivityMode,
		feedbackCounts,
		mappingCount,
		setMinConfidence,
		setDebug,
		setClipboardInterceptEnabled,
		setNerModelChoice,
		openOptions,
		openIssueReport,
		openSecurityReport,
		openPrivacySupport,
		openPrivacyPolicy,
		openTermsOfUse,
		openImpressum,
		clearFeedback,
		clearMappings,
	}: {
		minConfidence: Writable<number>;
		debug: Writable<boolean>;
		clipboardInterceptEnabled: Writable<boolean>;
		nerModel: Writable<NerModelKey>;
		nerModelChoice: Writable<string>;
		nerModelChoices: readonly NerModelChoice[];
		sensitivityMode: Writable<Settings['sensitivityMode']>;
		feedbackCounts: Writable<FeedbackCounts>;
		mappingCount: Writable<number>;
		setMinConfidence: (value: number) => Promise<void>;
		setDebug: (enabled: boolean) => Promise<void>;
		setClipboardInterceptEnabled: (enabled: boolean) => Promise<void>;
		setNerModelChoice: (value: string) => Promise<void>;
		openOptions: () => void;
		openIssueReport: () => void;
		openSecurityReport: () => void;
		openPrivacySupport: () => void;
		openPrivacyPolicy: () => void;
		openTermsOfUse: () => void;
		openImpressum: () => void;
		clearFeedback: () => Promise<void>;
		clearMappings: () => Promise<void>;
	} = $props();
	let sliderValue = $derived(Math.round($minConfidence * 100));
	const chevron = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>';
</script>

<div class="pk-stack">
	<article class="pk-card">
		<CardHeading title={$tr('set.detection')} />
		{#if $sensitivityMode === 'global'}
			<div class="pk-card-body">
				<div class="head"><label class="pk-label" for="pk-sens">{$tr('set.sens')}</label><span class="pk-fine">{sliderValue} %</span></div>
				<input id="pk-sens" class="pk-range" type="range" min="0" max="100" value={sliderValue} oninput={(event) => setMinConfidence(Number(event.currentTarget.value) / 100)} aria-label={$tr('set.sensAria')} />
				<div class="ticks pk-fine"><span>{$tr('set.sensFew')}</span><span>{$tr('set.sensMore')}</span></div>
			</div>
		{:else}
			<div class="pk-row">
				<div><span class="pk-label">{$tr('set.sens')}</span><span class="pk-meta">{$tr('set.sensIndividual')}</span></div>
				<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={openOptions}>{$tr('set.openOptions')}</button>
			</div>
		{/if}
		<div class="pk-divider"></div>
		<div class="pk-row">
			<div><span class="pk-label">{$tr('set.model')}</span><span class="pk-meta">{$tr('set.modelMeta')}</span></div>
			<select class="pk-select model" aria-label={$tr('set.model')} value={$nerModelChoice} onchange={(event) => setNerModelChoice(event.currentTarget.value)}>
				{#each nerModelChoices as choice (choice.value)}
					<option value={choice.value}>{choice.label}</option>
				{/each}
			</select>
		</div>
	</article>

	<article class="pk-card">
		<CardHeading title={$tr('set.behavior')} />
		<div class="pk-row"><div><span class="pk-label">{$tr('set.copy')}</span><span class="pk-meta">{$tr('set.copyMeta')}</span></div><Toggle size="sm" checked={$clipboardInterceptEnabled} onchange={(checked) => setClipboardInterceptEnabled(checked)} label={$tr('set.copy')} /></div>
		<div class="pk-divider"></div>
		<div class="pk-row"><div><span class="pk-label">{$tr('set.debug')}</span><span class="pk-meta">{$tr('set.debugMeta')}</span></div><Toggle size="sm" checked={$debug} onchange={(checked) => setDebug(checked)} label={$tr('set.debug')} /></div>
		<div class="pk-divider"></div>
		<div class="pk-row">
			<span class="pk-label">{$tr('set.language')}</span>
			<Segmented
				ariaLabel={$tr('set.langAria')}
				value={$languagePreference}
				options={[
					{ value: 'auto', label: $tr('set.langAuto') },
					{ value: 'da', label: $tr('set.langDa') },
					{ value: 'en', label: $tr('set.langEn') },
				]}
				onchange={(pref: LanguagePreference) => void chooseLanguage(pref)}
			/>
		</div>
	</article>

	<article class="pk-card">
		<CardHeading title={$tr('set.maint')} />
		<button type="button" class="pk-link-row" onclick={clearFeedback}><span class="pk-label">{$tr('set.clearFeedback')}</span><span class="pk-right">{$tr('set.corrections', { n: $feedbackCounts.confirmed })}{@html chevron}</span></button>
		<div class="pk-divider"></div>
		<button type="button" class="pk-link-row" onclick={clearMappings}><span class="pk-label">{$tr('set.clearMappings')}</span><span class="pk-right">{$tr('vault.saved', { n: $mappingCount })}{@html chevron}</span></button>
	</article>

	<article class="pk-card">
		<CardHeading title={$tr('set.support')} />
		<button type="button" class="pk-link-row" onclick={openIssueReport}><span class="pk-label">{$tr('set.reportIssue')}</span><span class="pk-right">{@html chevron}</span></button>
		<div class="pk-divider"></div>
		<button type="button" class="pk-link-row" onclick={openSecurityReport}><span class="pk-label">{$tr('set.reportSecurity')}</span><span class="pk-right">{@html chevron}</span></button>
		<div class="pk-divider"></div>
		<button type="button" class="pk-link-row" onclick={openPrivacySupport}><span class="pk-label">{$tr('set.support2')}</span><span class="pk-right">{@html chevron}</span></button>
	</article>

	<LegalCard {openPrivacyPolicy} {openTermsOfUse} {openImpressum} />
	<p class="pk-fine version">{$tr('set.version', { model: $nerModel })}</p>
</div>

<style>
	.head, .ticks { display: flex; justify-content: space-between; align-items: center; }
	.model { width: auto; max-width: 190px; padding: 6px 10px; font-size: 13px; }
	.version { text-align: center; padding: 2px 0 6px; }
</style>
