<script lang="ts">
	import type { Readable, Writable } from 'svelte/store';
	import type { StatusPill } from '../popup-model.svelte';
	import type { ComposerMatchState } from '../../shared/message-types';
	import type { ResourceSummary } from '../../shared/popup-resource-summary';
	import { tr } from '../../shared/i18n/store';

	let { enabled, wasmStatus, nerStatus, cpuFallback, resourceSummary, composerMatch, retryLocalAi, retrying }: {
		enabled: Writable<boolean>;
		wasmStatus: Writable<StatusPill>;
		nerStatus: Writable<StatusPill>;
		cpuFallback: Writable<boolean>;
		resourceSummary: Readable<ResourceSummary | null>;
		composerMatch: Writable<ComposerMatchState | null>;
		retryLocalAi: () => Promise<void>;
		retrying: Writable<boolean>;
	} = $props();

	const tone = (t: string) => (t === 'ok' ? '' : t === 'danger' ? 'bad' : 'off');
</script>

<div class="pills" role="group" aria-label={$tr('st.label')}>
	<span class="pk-pill" class:off={!$enabled}>
		<span class={['pk-dot', !$enabled && 'off']}></span>
		{$tr('st.protection')}: {$enabled ? $tr('st.on') : $tr('st.off')}
	</span>
	<span class={['pk-pill', tone($nerStatus.tone)]} title={$nerStatus.title}>
		<span class={['pk-dot', tone($nerStatus.tone)]}></span>
		{$tr('st.localAi')}: {$nerStatus.label}
	</span>
	<span class={['pk-pill', tone($wasmStatus.tone)]} title={$wasmStatus.title}>
		<span class={['pk-dot', tone($wasmStatus.tone)]}></span>
		{$tr('st.engine')}: {$wasmStatus.label}
	</span>
</div>

<p class="pk-fine" role="note">{$tr('common.aiNotice')}</p>

{#if $composerMatch === 'generic'}
	<!-- Quiet on purpose: pastes on this page are still reviewed. -->
	<p class="pk-fine" role="note">{$tr('pp.generic')}</p>
{/if}

{#if $resourceSummary}
	<div
		class="pk-notice"
		data-tone={$resourceSummary.tone === 'warning' ? undefined : $resourceSummary.tone}
		role="status"
		aria-label={$tr('pp.resource')}
	>
		<strong>{$resourceSummary.title}</strong>
		<span>{$resourceSummary.detail}</span>
		{#if $resourceSummary.retryable}
			<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" disabled={$retrying} onclick={() => retryLocalAi()}>
				{$retrying ? $tr('res.retrying') : $tr('res.retry')}
			</button>
		{/if}
	</div>
{:else if $cpuFallback}
	<div class="pk-notice" role="status">
		<strong>{$tr('pp.cpuTitle')}</strong>
		<span>{$tr('pp.cpuText')}</span>
	</div>
{/if}

<style>
	.pills { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
