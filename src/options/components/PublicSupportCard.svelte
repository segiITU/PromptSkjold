<script lang="ts">
	import { packagedTermsUrl, PUBLIC_PROJECT_LINKS, SECURITY_SUPPORT_EMAIL, TERMS_PUBLISHED } from '../../shared/project-links';
	import { tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	const termsUrl = packagedTermsUrl();
</script>

<article class="pk-card" id="support-section">
	<CardHeading title={$tr('sup.title')} hint={$tr('sup.hint')} />
	<div class="pk-card-body">
		<div class="pk-links">
			<a href={PUBLIC_PROJECT_LINKS.newIssue} target="_blank" rel="noopener noreferrer">{$tr('sup.report')}</a>
			<a href={PUBLIC_PROJECT_LINKS.security} target="_blank" rel="noopener noreferrer">{$tr('sup.security')}</a>
			<a href={PUBLIC_PROJECT_LINKS.support} target="_blank" rel="noopener noreferrer">{$tr('sup.support')}</a>
		</div>
		<h4 class="pk-h-small">{$tr('sup.legal')}</h4>
		<div class="pk-links">
			<a href={PUBLIC_PROJECT_LINKS.privacy} target="_blank" rel="noopener noreferrer">{$tr('sup.privacy')}</a>
			<a href={PUBLIC_PROJECT_LINKS.impressum} target="_blank" rel="noopener noreferrer">{$tr('sup.impressum')}</a>
			{#if TERMS_PUBLISHED}
				<a href={termsUrl} target="_blank" rel="noopener noreferrer">{$tr('sup.terms')}</a>
			{:else}
				<span class="pending" aria-disabled="true" title={$tr('sup.termsSoonTitle')}>{$tr('sup.termsSoon')}</span>
			{/if}
		</div>
		<p class="pk-fine">{$tr('sup.note')} <span class="pk-code">{SECURITY_SUPPORT_EMAIL}</span>.</p>
	</div>
</article>

<style>
	.pending { display: flex; align-items: center; justify-content: center; min-height: 40px; padding: 6px 10px; border: 1.5px dashed var(--line-2); border-radius: 999px; color: var(--ink-3); font-weight: 600; font-size: 13px; text-align: center; }
	h4 { margin: 0; }
</style>
