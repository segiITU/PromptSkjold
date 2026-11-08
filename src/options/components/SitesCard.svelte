<script lang="ts">
	import { onMount } from 'svelte';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import SiteStatusIcon from '../../popup/components/SiteStatusIcon.svelte';
	import SuggestedSites from '../../popup/components/SuggestedSites.svelte';
	import { DEFAULT_CURATED_URLS } from '../../shared/constants';
	import { siteText } from '../../shared/user-sites-strings';
	import { language } from '../../shared/i18n/store';
	import {
		addUserSite,
		effectiveStatus,
		parseSiteInput,
		removeUserSite,
		watchUserSites,
		type UserSitesSnapshot,
	} from '../../shared/user-sites';

	const t = $derived(siteText($language));
	const builtin = DEFAULT_CURATED_URLS.map((url) => new URL(url).hostname);

	let snapshot: UserSitesSnapshot = $state({ sites: [], statuses: {} });
	let input = $state('');
	let error = $state('');
	let busy = $state(false);

	onMount(() => watchUserSites((next) => (snapshot = next)));

	async function add(): Promise<void> {
		const parsed = parseSiteInput(input, snapshot.sites.map((site) => site.host));
		if (!parsed.ok) {
			error = t.parse[parsed.reason];
			return;
		}
		error = '';
		busy = true;
		input = '';
		try {
			await addUserSite(parsed.host);
		} finally {
			busy = false;
		}
	}
</script>

<article class="pk-card" id="sites-section">
	<CardHeading title={t.title} hint="https" />
	<div class="pk-card-body">
		<p class="pk-fine">{t.hint}</p>

		<form class="add" onsubmit={(event) => { event.preventDefault(); void add(); }}>
			<input type="text" class="pk-input" bind:value={input} placeholder={t.placeholder} aria-label={t.title} autocomplete="off" spellcheck="false" />
			<button class="pk-btn pk-btn-ink pk-btn-sm" type="submit" disabled={busy}>{t.add}</button>
		</form>
		{#if error}<p class="pk-error" role="alert">{error}</p>{/if}

		<ul class="sites">
			{#each builtin as host (host)}
				<li><SiteStatusIcon state="active" /><span class="host">{host}</span><span class="tag">{t.builtin}</span></li>
			{/each}
			{#each snapshot.sites as site (site.host)}
				{@const status = effectiveStatus(site, snapshot.statuses[site.host])}
				<li>
					<SiteStatusIcon state={status.state} />
					<span class="host">{site.host}</span>
					{#if status.state === 'pending'}<span class="tag">{t.pending}</span>{/if}
					{#if status.state === 'active'}<span class="tag">{t.active}</span>{/if}
					<span class="spacer"></span>
					{#if status.state === 'error'}
						<button class="pk-btn pk-btn-outline pk-btn-sm" type="button" onclick={() => addUserSite(site.host)}>{t.retry}</button>
					{/if}
					<button class="pk-btn pk-btn-quiet pk-btn-sm" type="button" onclick={() => removeUserSite(site.host)}>{t.remove}</button>
					{#if status.state === 'error' && status.reason}
						<p class="pk-error row-error" role="alert">{t.errors[status.reason]}</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if snapshot.sites.length === 0}<p class="pk-fine">{t.emptyList}</p>{/if}

		<SuggestedSites />
	</div>
</article>

<style>
	.add { display: flex; gap: 8px; }
	.add input { flex: 1; min-width: 0; width: auto; }
	.sites { list-style: none; margin: 4px 0 0; padding: 0; }
	.sites li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid var(--line); }
	.host { font-weight: 600; }
	.tag { color: var(--ink-3); font-size: 12.5px; }
	.spacer { flex: 1; }
	.row-error { flex-basis: 100%; margin: 0 0 0 26px; }
</style>
