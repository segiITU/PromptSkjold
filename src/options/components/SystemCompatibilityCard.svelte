<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { LocalAiUnloadTimeoutMs, Settings, SystemCompatibilityStatus } from '../../shared/message-types';
	import { LOCAL_AI_UNLOAD_TIMEOUT_CHOICES, nerModelChoices, nerModelChoiceValue } from '../../shared/constants';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		status,
		warmupState,
		setLocalAiDetection,
		retryLocalAi,
		rerunSystemCheck,
		setNerModelChoice,
		setLocalAiUnloadTimeoutMs,
		setKeepLocalAiLoadedWhileActive,
		setAutoWarmLocalAiOnActiveSupportedPage,
	}: {
		settings: Writable<Settings | null>;
		status: Writable<SystemCompatibilityStatus | null>;
		warmupState: Writable<'idle' | 'loading' | 'ready' | 'failed'>;
		setLocalAiDetection: (enabled: boolean) => Promise<void>;
		retryLocalAi: () => Promise<void>;
		rerunSystemCheck: () => Promise<void>;
		setNerModelChoice: (value: string) => Promise<void>;
		setLocalAiUnloadTimeoutMs: (value: LocalAiUnloadTimeoutMs) => Promise<void>;
		setKeepLocalAiLoadedWhileActive: (enabled: boolean) => Promise<void>;
		setAutoWarmLocalAiOnActiveSupportedPage: (enabled: boolean) => Promise<void>;
	} = $props();

	let rerunInFlight = $state(false);

	async function handleRerun() {
		if (rerunInFlight) return;
		rerunInFlight = true;
		try {
			await rerunSystemCheck();
		} finally {
			rerunInFlight = false;
		}
	}

	let memoryLabel = $derived.by(() => {
		if (!$status) return $tr('sys.checking');
		return typeof $status.browserMemoryGb === 'number'
			? $tr('sys.mem', { gb: $status.browserMemoryGb })
			: $tr('sys.memUnavailable');
	});

	let tierLabel = $derived.by(() => {
		if (!$status) return $tr('sys.tier.loading');
		if ($status.tier === 'critical') return $tr('sys.tier.critical');
		if ($status.tier === 'warning') return $tr('sys.tier.warning');
		if ($status.tier === 'unknown') return $tr('sys.tier.unknown');
		return $tr('sys.tier.ok');
	});

	let localAiLabel = $derived.by(() => {
		if (!$settings) return $tr('sys.ai.loading');
		if ($settings.nerProvider === 'off') return $tr('sys.ai.off');
		if ($settings.nerProvider === 'fixture') return $tr('sys.ai.fixture');
		return $tr('sys.ai.on');
	});

	let runtimeLabel = $derived.by(() => {
		const runtime = $status?.runtimeState ?? 'unknown';
		if ($warmupState === 'loading') return $tr('sys.rt.loading');
		if ($warmupState === 'ready') return $tr('sys.rt.ready');
		if ($warmupState === 'failed') return $tr('sys.rt.failed');
		if (runtime === 'not-loaded') return $tr('sys.rt.notLoaded');
		if (runtime === 'unknown') return $tr('sys.rt.unknown');
		return $tr('sys.rt.state', { state: runtime });
	});

	let localAiEnabled = $derived($settings?.nerProvider !== 'off');
	let modelPickerDisabled = $derived(!$settings || !localAiEnabled || $warmupState === 'loading');
	let unloadTimeoutValue = $derived(String($settings?.localAiUnloadTimeoutMs ?? 'session'));
	let loadFailureMessage = $derived($status?.loadFailure?.message ?? null);
	let showRetry = $derived(
		($status?.localAiState === 'off-load-failure' || $warmupState === 'failed') && $warmupState !== 'loading',
	);
	const modelChoices = nerModelChoices();
	let modelChoiceValue = $derived(
		nerModelChoiceValue($settings?.nerModel ?? 'bardsai-mini', $settings?.nerWebGpuDtype),
	);

	function timeoutLabel(value: LocalAiUnloadTimeoutMs): string {
		if (value === null) return $tr('sys.unloadSession');
		return $tr('sys.unloadMin', { n: Math.round(value / 60000) });
	}

	function parseTimeout(value: string): LocalAiUnloadTimeoutMs {
		return value === 'session' ? null : Number(value) as LocalAiUnloadTimeoutMs;
	}
</script>

<article class="pk-card" id="system-compatibility-section" aria-live="polite">
	<CardHeading title={$tr('sys.title')} hint={$tr('sys.hint')} />

	<div class="pk-card-body">
		<div class="pk-notice" data-tone={$status?.tier === 'critical' ? 'critical' : $status?.tier === 'ok' ? 'ok' : $status ? undefined : 'muted'}>
			<strong>{tierLabel}</strong>
			<span>{memoryLabel}</span>
		</div>

		<p class="pk-fine" role="note">{$tr('common.aiNotice')}</p>

		<div class="box">
			<div class="line">
				<div>
					<span class="pk-label">{$tr('sys.toggle')}</span>
					<span class="pk-meta">{$tr('sys.toggleText')}</span>
				</div>
				<span id="local-ai-toggle" class="tg">
					<Toggle
						checked={localAiEnabled}
						label={$tr('sys.toggle')}
						onchange={(checked) => setLocalAiDetection(checked)}
					/>
				</span>
			</div>

			<label class="pk-label gap" for="local-ai-model">{$tr('sys.model')}</label>
			<select
				id="local-ai-model"
				class="pk-select"
				value={modelChoiceValue}
				disabled={modelPickerDisabled}
				onchange={(event) => setNerModelChoice(event.currentTarget.value)}
			>
				{#each modelChoices as choice (choice.value)}
					<option value={choice.value}>{choice.label}</option>
				{/each}
			</select>
			<p class="pk-fine">{$tr('sys.q4')}</p>
			{#if $warmupState === 'loading'}
				<p class="pk-fine">{$tr('sys.loadingAi')}</p>
			{/if}

			{#if showRetry}
				<div class="pk-notice" data-tone="critical" role="status">
					<strong>{$tr('sys.failTitle')}</strong>
					<span>{loadFailureMessage ?? $tr('sys.failDefault')}</span>
					<button type="button" class="pk-btn pk-btn-outline pk-btn-sm retry" onclick={() => retryLocalAi()}>{$tr('sys.retry')}</button>
				</div>
			{/if}

			<div class="runtime">
				<label class="pk-label" for="local-ai-unload-timeout">{$tr('sys.unload')}</label>
				<select
					id="local-ai-unload-timeout"
					class="pk-select"
					value={unloadTimeoutValue}
					disabled={!$settings}
					onchange={(event) => setLocalAiUnloadTimeoutMs(parseTimeout(event.currentTarget.value))}
				>
					{#each LOCAL_AI_UNLOAD_TIMEOUT_CHOICES as timeout (String(timeout))}
						<option value={timeout === null ? 'session' : String(timeout)}>{timeoutLabel(timeout)}</option>
					{/each}
				</select>
				<label class="pk-check">
					<input
						type="checkbox"
						checked={$settings?.keepLocalAiLoadedWhileActive ?? true}
						disabled={!$settings}
						onchange={(event) => setKeepLocalAiLoadedWhileActive(event.currentTarget.checked)}
					/>
					<span>{$tr('sys.keep')}</span>
				</label>
				<label class="pk-check">
					<input
						type="checkbox"
						checked={$settings?.autoWarmLocalAiOnActiveSupportedPage ?? false}
						disabled={!$settings || !localAiEnabled}
						onchange={(event) => setAutoWarmLocalAiOnActiveSupportedPage(event.currentTarget.checked)}
					/>
					<span>{$tr('sys.warm')}</span>
				</label>
			</div>
		</div>

		<dl class="pk-facts">
			<div><dt>{$tr('sys.statusAi')}</dt><dd>{localAiLabel}</dd></div>
			<div><dt>{$tr('sys.statusRt')}</dt><dd>{runtimeLabel}</dd></div>
			<div><dt>{$tr('sys.webgpu')}</dt><dd>{$status?.webGpu ?? $tr('sys.webgpuChecking')}</dd></div>
		</dl>

		{#if $status?.notes?.length}
			<ul class="notes" aria-label={$tr('sys.notesAria')}>
				{#each $status.notes as note (note)}
					<li class="pk-fine">{note}</li>
				{/each}
			</ul>
		{:else}
			<p class="pk-fine">{$tr('sys.pending')}</p>
		{/if}

		<div class="actions">
			<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={handleRerun} disabled={rerunInFlight}>
				{rerunInFlight ? $tr('sys.rerunBusy') : $tr('sys.rerun')}
			</button>
			<p class="pk-fine">{$tr('sys.rerunHint')}</p>
		</div>
	</div>
</article>

<style>
	.box { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); }
	.line { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
	.tg { flex: none; }
	.gap { margin-top: 6px; }
	.runtime { display: grid; gap: 8px; margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
	.notes { list-style: disc; padding-left: 18px; display: grid; gap: 4px; }
	.actions { display: grid; justify-items: start; gap: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
	.retry { justify-self: start; margin-top: 4px; }
</style>
