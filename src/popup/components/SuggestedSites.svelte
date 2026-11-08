<script lang="ts">
	import { onMount } from 'svelte';
	import { remainingSuggestions } from '../../shared/suggested-sites';
	import { siteText, type SiteLang } from '../../shared/user-sites-strings';
	import { addUserSite, watchUserSites } from '../../shared/user-sites';

	let { lang = 'da' }: { lang?: SiteLang } = $props();

	const t = $derived(siteText(lang));
	let added: string[] = $state([]);
	let suggestions = $derived(remainingSuggestions(added));

	onMount(() => watchUserSites((next) => (added = next.sites.map((site) => site.host))));
</script>

{#if suggestions.length > 0}
	<section class="suggested" aria-label={t.suggestedTitle}>
		<h3>{t.suggestedTitle}</h3>
		<ul>
			{#each suggestions as site (site.host)}
				<li>
					<span class="name">{site.name}</span>
					<span class="note">{site.host} · {site.note[lang]}</span>
					<button type="button" onclick={() => addUserSite(site.host)}>{t.add}</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.suggested { margin-top: 14px; }
	h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.04em; }
	ul { list-style: none; margin: 0; padding: 0; }
	li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 10px; padding: 7px 0; border-top: var(--border-hairline); font-size: 13px; }
	.name { font-weight: 500; }
	.note { color: var(--color-muted); font-size: 11px; }
	button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px; cursor: pointer; background: transparent; color: var(--color-ink); border: var(--border-hairline); }
</style>
