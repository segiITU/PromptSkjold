<script lang="ts">
	import { onMount } from 'svelte';
	import SiteStatusIcon from './SiteStatusIcon.svelte';
	import { siteText } from '../../shared/user-sites-strings';
	import { language } from '../../shared/i18n/store';
	import {
		addUserSite,
		effectiveStatus,
		findUserSiteHost,
		isCuratedUrl,
		parseSiteInput,
		watchUserSites,
		type UserSitesSnapshot,
	} from '../../shared/user-sites';

	const t = $derived(siteText($language));

	let pageUrl: string | undefined = $state();
	let snapshot: UserSitesSnapshot = $state({ sites: [], statuses: {} });

	onMount(() => {
		// `activeTab` makes the address readable because the popup was opened from the toolbar.
		void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => (pageUrl = tab?.url));
		return watchUserSites((next) => (snapshot = next));
	});

	let builtin = $derived(isCuratedUrl(pageUrl));
	let host = $derived(pageUrl ? findUserSiteHost(pageUrl, snapshot.sites.map((site) => site.host)) : null);
	let candidate = $derived.by(() => {
		if (!pageUrl || builtin || host || !pageUrl.startsWith('https://')) return null;
		const parsed = parseSiteInput(new URL(pageUrl).hostname);
		return parsed.ok ? parsed.host : null;
	});
	let site = $derived(snapshot.sites.find((entry) => entry.host === host));
	let status = $derived(site ? effectiveStatus(site, snapshot.statuses[site.host]) : null);
</script>

{#if candidate}
	<section class="pk-banner warn">
		<p>{t.unsupportedBanner}</p>
		<button type="button" class="pk-btn pk-btn-ink pk-btn-sm" onclick={() => addUserSite(candidate)}>{t.addThisPage} ({candidate})</button>
	</section>
{:else if site && status}
	<section class="pk-banner" class:warn={status.state === 'error'}>
		<p class="row">
			<SiteStatusIcon state={status.state} />
			<span>{status.state === 'pending' ? t.pending : status.state === 'active' ? t.active : status.reason ? t.errors[status.reason] : ''}</span>
		</p>
		{#if status.state === 'error'}
			<button type="button" class="pk-btn pk-btn-ink pk-btn-sm" onclick={() => addUserSite(site.host)}>{t.retry}</button>
		{/if}
	</section>
{/if}

<style>
	.row { display: flex; align-items: center; gap: 8px; }
	button { align-self: start; }
</style>
