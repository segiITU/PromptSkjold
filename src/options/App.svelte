<script lang="ts">
	import { onMount } from 'svelte';
	import { createOptionsModel } from './options-model.svelte';
	import { tr } from '../shared/i18n/store';
	import type { MessageKey } from '../shared/i18n/da';
	import AllowlistCard from './components/AllowlistCard.svelte';
	import BlocklistCard from './components/BlocklistCard.svelte';
	import CancelDetectionCard from './components/CancelDetectionCard.svelte';
	import CodeBlocksCard from './components/CodeBlocksCard.svelte';
	import DebugSystemCheckCard from './components/DebugSystemCheckCard.svelte';
	import LanguageCard from './components/LanguageCard.svelte';
	import OcrCard from './components/OcrCard.svelte';
	import SyntheticLocaleCard from './components/SyntheticLocaleCard.svelte';
	import PublicSupportCard from './components/PublicSupportCard.svelte';
	import SensitivityCard from './components/SensitivityCard.svelte';
	import SitesCard from './components/SitesCard.svelte';
	import SystemCompatibilityCard from './components/SystemCompatibilityCard.svelte';
	import VaultCard from './components/VaultCard.svelte';
	import { openOnboarding } from '../shared/onboarding-storage';

	const model = createOptionsModel();
	let allowlistCard: AllowlistCard | undefined = $state();
	let activeId = $state('system-compatibility-section');

	// Sections in page order. `id` is the card's own element id (also used by deep links such as #vault-section).
	const NAV: ReadonlyArray<{ id: string; label: MessageKey }> = [
		{ id: 'system-compatibility-section', label: 'nav.system' },
		{ id: 'sites-section', label: 'nav.sites' },
		{ id: 'sensitivity-section', label: 'nav.sens' },
		{ id: 'allowlist-section', label: 'nav.allow' },
		{ id: 'blocklist-section', label: 'nav.block' },
		{ id: 'vault-section', label: 'nav.vault' },
		{ id: 'cancel-detection-section', label: 'nav.cancel' },
		{ id: 'code-blocks-section', label: 'nav.code' },
		{ id: 'synthetic-locale-section', label: 'nav.synthetic' },
		{ id: 'ocr-section', label: 'nav.ocr' },
		{ id: 'language-section', label: 'nav.language' },
		{ id: 'support-section', label: 'nav.help' },
	];

	function go(event: MouseEvent, id: string) {
		event.preventDefault();
		activeId = id;
		document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const prefill = params.get('allowlist');
		if (prefill) {
			queueMicrotask(() => {
				allowlistCard?.prefill(prefill);
				document.getElementById('allowlist-section')?.scrollIntoView({ behavior: 'smooth' });
			});
		}
		const hash = window.location.hash.replace(/^#/, '');
		if (hash) {
			requestAnimationFrame(() => {
				document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}

		// Highlight the section that is currently at the top of the page.
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible[0]) activeId = visible[0].target.id;
			},
			{ rootMargin: '-10% 0px -70% 0px' },
		);
		for (const item of NAV) {
			const el = document.getElementById(item.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	});
</script>

<a class="skip" href="#content">{$tr('opt.skip')}</a>

<div class="shell">
	<header class="head">
		<div>
			<h1><img class="lockup" src="/assets/lockup.png" alt="PromptSkjold" width="199" height="52" /></h1>
			<p class="pk-fine">{$tr('opt.title')}. {$tr('opt.sub')}</p>
		</div>
	</header>

	<div class="layout">
		<nav class="nav" aria-label={$tr('opt.nav')}>
			{#each NAV as item (item.id)}
				<a href={`#${item.id}`} class:on={activeId === item.id} aria-current={activeId === item.id ? 'true' : undefined} onclick={(e) => go(e, item.id)}>{$tr(item.label)}</a>
			{/each}
		</nav>

		<main class="content" id="content" tabindex="-1">
			<SystemCompatibilityCard
				settings={model.settings}
				status={model.systemCompatibility}
				warmupState={model.localAiWarmupState}
				setLocalAiDetection={model.setLocalAiDetection}
				retryLocalAi={model.retryLocalAi}
				rerunSystemCheck={model.rerunSystemCheck}
				setNerModelChoice={model.setNerModelChoice}
				setLocalAiUnloadTimeoutMs={model.setLocalAiUnloadTimeoutMs}
				setKeepLocalAiLoadedWhileActive={model.setKeepLocalAiLoadedWhileActive}
				setAutoWarmLocalAiOnActiveSupportedPage={model.setAutoWarmLocalAiOnActiveSupportedPage}
			/>

			<SitesCard />

			<SensitivityCard
				settings={model.settings}
				groupNames={model.groupNames}
				setSensitivityMode={model.setSensitivityMode}
				setGlobalThreshold={model.setGlobalThreshold}
				setGroupThreshold={model.setGroupThreshold}
			/>

			<AllowlistCard
				bind:this={allowlistCard}
				settings={model.settings}
				error={model.allowlistError}
				addEntry={model.addAllowlistEntry}
				removeEntry={model.removeAllowlistEntry}
				clearError={model.clearAllowlistError}
			/>

			<BlocklistCard
				settings={model.settings}
				error={model.blocklistError}
				addEntry={model.addBlocklistEntry}
				removeEntry={model.removeBlocklistEntry}
				updateCategory={model.updateBlocklistCategory}
				clearError={model.clearBlocklistError}
			/>

			<VaultCard
				settings={model.settings}
				records={model.vaultRecords}
				setVaultEnabled={model.setVaultEnabled}
				setDefaultReplacementMode={model.setDefaultReplacementMode}
				updateRecord={model.updateVaultRecord}
				deleteRecord={model.deleteVaultRecord}
				exportVault={model.exportVault}
				importVault={model.importVault}
				clearUnpinned={model.clearUnpinned}
			/>

			<CancelDetectionCard settings={model.settings} setValue={model.setCancelDetectionBehavior} />

			<CodeBlocksCard settings={model.settings} setValue={model.setSkipCodeBlocks} />

			<SyntheticLocaleCard settings={model.settings} setValue={model.setSyntheticLocale} />

			<OcrCard settings={model.settings} setValue={model.setImageCheckEnabled} setOffice={model.setOfficeCheckEnabled} />

			<LanguageCard />

			<p class="guide-link"><button type="button" class="pk-link-btn" onclick={() => openOnboarding()}>{$tr('opt.guide')}</button></p>

			<PublicSupportCard />

			<DebugSystemCheckCard
				settings={model.settings}
				status={model.systemCompatibility}
				setDebug={model.setDebug}
				applyScenario={model.applyDebugSystemCheckScenario}
				clearOverride={model.clearDebugSystemCheck}
			/>
		</main>
	</div>
</div>

<style>
	:global(body) { background: var(--desk); }
	.skip { position: absolute; left: -999px; top: 8px; background: var(--ink); color: var(--paper); padding: 8px 14px; border-radius: 999px; z-index: 10; }
	.skip:focus { left: 12px; }
	.shell { max-width: 1060px; margin: 0 auto; padding: 28px 20px 64px; }
	.head { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
	.head h1 { margin: 0 0 6px; line-height: 0; }
	.lockup { display: block; height: 52px; width: auto; max-width: 100%; }
	.layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 36px; align-items: start; }
	.nav { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 2px; }
	.nav a { text-decoration: none; color: var(--ink-2); padding: 7px 12px; border-radius: 12px; font-weight: 500; font-size: 13.5px; }
	.nav a:hover { background: rgb(27 27 26 / 6%); color: var(--ink); }
	.nav a.on { background: var(--ink); color: var(--paper); }
	.content { display: grid; gap: 22px; min-width: 0; outline: none; }
	.content > :global(article) { scroll-margin-top: 20px; }
	.guide-link { margin: 0; }
	@media (max-width: 860px) {
		.layout { grid-template-columns: 1fr; gap: 18px; }
		.nav { position: static; flex-direction: row; flex-wrap: wrap; }
		.shell { padding: 20px 14px 48px; }
	}
</style>
