<script lang="ts">
	import type { Readable, Writable } from 'svelte/store';
	import type { FeedbackCounts, TestOutcome } from '../popup-model.svelte';
	import type { MessageKey } from '../../shared/i18n/da';
	import { tr, trn } from '../../shared/i18n/store';
	import { categoryOf } from '../../shared/design/categories';
	import EntityIcon from '../../shared/design/EntityIcon.svelte';
	import FeedbackCard from './FeedbackCard.svelte';
	import CardHeading from './CardHeading.svelte';
	import { segmentText } from '../test-highlight';

	let {
		testInput,
		isRunning,
		outcome,
		enabledCount,
		feedbackCounts,
		runDetection,
		clearFeedback,
	}: {
		testInput: Writable<string>;
		isRunning: Writable<boolean>;
		outcome: Writable<TestOutcome>;
		enabledCount: Readable<number>;
		feedbackCounts: Writable<FeedbackCounts>;
		runDetection: () => Promise<void>;
		clearFeedback: () => Promise<void>;
	} = $props();

	let flashed = $state<number | null>(null);

	/** Clicking a mark in the checked text brings its entry in the list into view. */
	function showEntry(index: number) {
		const el = document.getElementById(`pk-res-${index}`);
		if (!el) return;
		el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		el.focus({ preventScroll: true });
		flashed = index;
		setTimeout(() => (flashed = null), 1400);
	}
</script>

<div class="pk-stack">
	<article class="pk-card">
		<CardHeading title={$tr('test.title')} hint={$tr('test.hint', { n: $enabledCount })} />
		<div class="pk-card-body">
			<label class="pk-field-label" for="pk-test-input">{$tr('test.label')}</label>
			<textarea id="pk-test-input" class="pk-textarea" rows="5" bind:value={$testInput} placeholder={$tr('test.ph')}></textarea>
			<div class="btns">
				<button type="button" class="pk-btn pk-btn-ink pk-btn-sm" disabled={$isRunning || !$testInput.trim()} onclick={runDetection}>
					{$isRunning ? $tr('test.running') : $tr('test.run')}
				</button>
			</div>
		</div>
	</article>

	<div class="out" aria-live="polite">
		{#if $outcome.state === 'idle'}
			<p class="pk-fine">{$tr('test.empty')}</p>
		{:else if $outcome.state === 'running'}
			<p class="pk-fine">{$tr('test.running')}</p>
		{:else if $outcome.state === 'error'}
			<div class="pk-notice" data-tone="critical" role="alert"><span>{$outcome.message}</span></div>
		{:else if $outcome.spans.length === 0}
			<p class="pk-fine">{$tr('test.none')}</p>
		{:else}
			<article class="pk-card checked">
				<div class="pk-card-head"><h3>{$tr('test.checked')}</h3></div>
				{#if $outcome.text === $testInput}
					<p class="text" id="pk-checked-text">
						{#each segmentText($outcome.text, $outcome.spans) as seg}{#if seg.mark}{@const label = $tr(`entity.${seg.mark.type}` as MessageKey)}<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions --><mark
									class="pk-mk"
									data-cat={seg.mark.category}
									title={$tr('test.markTitle', { type: label, p: Math.round(seg.mark.score * 100) })}
									onclick={() => showEntry(seg.mark!.index)}
								>{seg.text}<span class="sr-only"> ({label})</span></mark>{:else}{seg.text}{/if}{/each}
					</p>
				{:else}
					<p class="pk-note">{$tr('test.stale')}</p>
				{/if}
			</article>
			<article class="pk-card">
				<div class="pk-card-head">
					<h3>{$trn('test.found', $outcome.spans.length)}</h3>
					<span class="pk-fine">
						{$outcome.nerMs !== undefined
							? $tr('test.tookNer', { ms: $outcome.totalMs ?? 0, ner: $outcome.nerMs })
							: $outcome.totalMs !== undefined
								? $tr('test.took', { ms: $outcome.totalMs })
								: ''}
					</span>
				</div>
				<ul class="res">
					{#each $outcome.spans as span, i}
						{@const cat = categoryOf(span.entity_type)}
						<li data-cat={cat} id={`pk-res-${i}`} tabindex="-1" class:flash={flashed === i}>
							<span class="pk-chip"><EntityIcon name={cat} size={15} />{$tr(`entity.${span.entity_type}` as MessageKey)}</span>
							<span class="v">{span.text}</span>
							<span class="cf">{Math.round(span.score * 100)} %</span>
						</li>
					{/each}
				</ul>
				{#if $outcome.nerLine}<p class="pk-note">{$outcome.nerLine}</p>{/if}
			</article>
		{/if}
	</div>

	<FeedbackCard {feedbackCounts} {clearFeedback} />
</div>

<style>
	.checked .text { margin: 0; padding: 12px 14px; font: 400 14.5px/1.75 var(--f-voice); white-space: pre-wrap; overflow-wrap: anywhere; }
	.checked :global(mark.pk-mk) { color: inherit; padding: 0 1px; }
	.res li { outline-offset: -2px; transition: background-color 0.3s; }
	.res li.flash { background: color-mix(in srgb, var(--c) 14%, transparent); }
	.out { display: grid; gap: 12px; }
	.btns { display: flex; justify-content: flex-end; gap: 8px; }
	.res li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 9px 14px; border-top: 1px solid var(--line); }
	.res li:first-child { border-top: 0; }
	.v { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cf { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
</style>
