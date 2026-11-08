<script lang="ts">
	import type { TestModel } from '../popup-model.svelte';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from './CardHeading.svelte';

	let { feedbackCounts }: Pick<TestModel, 'feedbackCounts' | 'clearFeedback'> = $props();
</script>

<article class="pk-card">
	<CardHeading title={$tr('fb.title')} />
	<div class="stats">
		<div><b class="pk-voice">{$feedbackCounts.confirmed}</b><span>{$tr('fb.corrections')}</span></div>
		<div><b class="pk-voice">{$feedbackCounts.ignored}</b><span>{$tr('fb.allowlist')}</span></div>
	</div>
</article>

<style>
	.stats { display: flex; }
	.stats div { flex: 1; padding: 12px 8px; text-align: center; border-right: 1px solid var(--line); }
	.stats div:last-child { border-right: 0; }
	b { display: block; font-size: 26px; font-weight: 500; }
	span { display: block; margin-top: 2px; color: var(--ink-3); font-size: 12.5px; }
</style>
