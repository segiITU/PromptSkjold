<script lang="ts">
	import { tr } from '../../shared/i18n/store';
	import CardHeading from './CardHeading.svelte';

	let {
		openPrivacyPolicy,
		openTermsOfUse,
		openImpressum,
	}: {
		openPrivacyPolicy: () => void;
		openTermsOfUse: () => void;
		openImpressum: () => void;
	} = $props();

	const chevron = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>';
</script>

<article class="pk-card">
	<CardHeading title={$tr('legal.title')} />
	<button type="button" class="pk-link-row" onclick={openPrivacyPolicy}><span class="pk-label">{$tr('legal.privacy')}</span><span class="pk-right">{@html chevron}</span></button>
	<div class="pk-divider"></div>
	<button type="button" class="pk-link-row" onclick={openTermsOfUse}><span class="pk-label">{$tr('legal.terms')}</span><span class="pk-right">{@html chevron}</span></button>
	<div class="pk-divider"></div>
	<button type="button" class="pk-link-row" onclick={openImpressum}><span class="pk-label">{$tr('legal.impressum')}</span><span class="pk-right">{@html chevron}</span></button>
	<p class="pk-note">{$tr('common.disclaimer')}</p>
</article>
