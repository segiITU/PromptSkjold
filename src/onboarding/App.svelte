<script lang="ts">
	import { onMount } from 'svelte';
	import SuggestedSites from '../popup/components/SuggestedSites.svelte';
	import { DEFAULT_CURATED_URLS } from '../shared/constants';
	import { markOnboardingDone } from '../shared/onboarding-storage';
	import { effectiveStatus, watchUserSites, type UserSitesSnapshot } from '../shared/user-sites';
	import AddSiteDemo from './AddSiteDemo.svelte';
	import FlowDemo from './FlowDemo.svelte';
	import SetupControls from './SetupControls.svelte';
	import { packagedTermsUrl } from '../shared/project-links';
	import { EXTERNAL_LINKS, LIMITS, SLIDES, SLIDE_IDS, UI, type Lang } from './content';

	let lang: Lang = $state('da');
	let index = $state(0);
	// The first slide carries the use-at-your-own-risk terms; going on needs a tick.
	let accepted = $state(false);
	const termsUrl = packagedTermsUrl();
	const slide = $derived(SLIDES[SLIDE_IDS[index]]);
	const last = $derived(index === SLIDE_IDS.length - 1);
	const builtIn = DEFAULT_CURATED_URLS.map((url) => new URL(url).hostname);

	// Sites the user adds (also from the suggestions below) join the "protected" list as they are added.
	let snapshot: UserSitesSnapshot = $state({ sites: [], statuses: {} });
	onMount(() => watchUserSites((next) => (snapshot = next)));
	const mark = (state: string) => (state === 'active' ? '✓' : state === 'pending' ? '…' : '×');

	function go(delta: number): void {
		if (index === 0 && delta > 0 && !accepted) return;
		index = Math.min(SLIDE_IDS.length - 1, Math.max(0, index + delta));
	}

	async function finish(): Promise<void> {
		await markOnboardingDone();
		const tab = await chrome.tabs.getCurrent();
		if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
	}

	onMount(() => {
		// Opening the guide at all counts as having seen it.
		void markOnboardingDone();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'ArrowRight') go(1);
			if (event.key === 'ArrowLeft') go(-1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<main class="page" lang={lang}>
	<header>
		<span class="brand"><img class="lockup" src="/assets/lockup.png" alt="PromptSkjold" width="153" height="40" /></span>
		<button class="link" type="button" onclick={() => (lang = lang === 'da' ? 'en' : 'da')}>{UI.language[lang]}</button>
	</header>

	<section class="slide" aria-live="polite">
		<h1>{slide.title[lang]}</h1>
		<p class="body">{slide.body[lang]}</p>

		{#if SLIDE_IDS[index] === 'how'}
			<FlowDemo {lang} />
			<p class="limits">{LIMITS[lang]}</p>
			<label class="terms">
				<input type="checkbox" bind:checked={accepted} />
				<span>{UI.termsLabel[lang]} <a href={termsUrl} target="_blank" rel="noopener noreferrer">{UI.termsLink[lang]}</a></span>
			</label>
		{:else if SLIDE_IDS[index] === 'about'}
			<div class="actions">
				<a class="btn" href={EXTERNAL_LINKS.issues} target="_blank" rel="noopener noreferrer">{UI.reportBug[lang]}</a>
				<a class="btn" href={EXTERNAL_LINKS.contributing} target="_blank" rel="noopener noreferrer">{UI.contribute[lang]}</a>
				<a class="btn" href={EXTERNAL_LINKS.repo} target="_blank" rel="noopener noreferrer">{UI.viewCode[lang]}</a>
			</div>
			<div class="cta">
				<strong>{UI.ctaTitle[lang]}</strong>
				<span>{UI.ctaBody[lang]}</span>
				<a class="btn primary" href={EXTERNAL_LINKS.ermias} target="_blank" rel="noopener noreferrer">{UI.ctaButton[lang]}</a>
			</div>
		{:else if SLIDE_IDS[index] === 'sites'}
			<AddSiteDemo {lang} />
			<p class="builtin-label">{UI.builtIn[lang]}</p>
			<ul class="builtin">
				{#each builtIn as host (host)}<li><span class="tick">✓</span>{host}</li>{/each}
				{#each snapshot.sites as site (site.host)}
					{@const status = effectiveStatus(site, snapshot.statuses[site.host])}
					<li class="added" data-state={status.state}><span class={['tick', status.state !== 'active' && 'wait']}>{mark(status.state)}</span>{site.host}</li>
				{/each}
			</ul>
			<SuggestedSites {lang} />
		{:else}
			<SetupControls {lang} />
		{/if}
	</section>

	<footer>
		<div class="dots" aria-hidden="true">
			{#each SLIDE_IDS as id, i (id)}<span class:on={i === index}></span>{/each}
		</div>
		<div class="buttons">
			{#if index > 0}<button class="btn" type="button" onclick={() => go(-1)}>{UI.back[lang]}</button>{/if}
			{#if last}
				<button class="btn primary" type="button" onclick={finish}>{UI.done[lang]}</button>
			{:else}
				<button class="btn primary" type="button" disabled={index === 0 && !accepted} onclick={() => go(1)}>{UI.next[lang]}</button>
			{/if}
		</div>
	</footer>
</main>

<style>
	:global(html), :global(body) { margin: 0; min-height: 100vh; background: var(--color-surface); color: var(--color-ink); font-family: var(--font-sans); }
	.page { max-width: 640px; margin: 0 auto; padding: 24px 24px 48px; display: flex; flex-direction: column; gap: 20px; min-height: 100vh; box-sizing: border-box; }
	header { display: flex; align-items: center; justify-content: space-between; }
	.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; min-width: 0; }
	.lockup { display: block; height: 40px; width: auto; max-width: 100%; }
	.link { font: inherit; font-size: 13px; background: none; border: none; color: var(--color-muted); cursor: pointer; text-decoration: underline; }
	.slide { flex: 1; display: flex; flex-direction: column; gap: 16px; }
	h1 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
	.body { margin: 0; font-size: 16px; line-height: 1.6; color: var(--color-muted); }
	.builtin-label { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.04em; }
	.builtin { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 14px; }
	.tick { margin-right: 6px; color: #16a34a; font-weight: 700; }
	.tick.wait { color: var(--color-muted); }
	.added[data-state='error'] .tick { color: #b02a40; }
	footer { display: flex; align-items: center; justify-content: space-between; }
	.dots { display: flex; gap: 8px; }
	.dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--color-border, #cbd5e1); }
	.dots span.on { background: #2563eb; }
	.buttons { display: flex; gap: 8px; }
	.btn { font: inherit; font-size: 14px; padding: 9px 18px; border-radius: 10px; cursor: pointer; background: transparent; color: var(--color-ink); border: var(--border-hairline); text-decoration: none; display: inline-block; }
	.btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.limits { margin: 0; padding: 12px 14px; border-radius: 10px; background: #fef3c7; color: #78350f; font-size: 14px; line-height: 1.5; }
	.terms { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; cursor: pointer; }
	.terms input { margin-top: 3px; }
	.terms a { color: inherit; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.cta { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 16px; border-radius: 12px; border: var(--border-hairline); font-size: 14px; }
	.cta span { color: var(--color-muted); }
</style>
