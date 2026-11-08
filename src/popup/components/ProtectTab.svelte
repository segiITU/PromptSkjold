<script lang="ts">
	import type { CategoriesModel, ProtectionModel, VaultModel } from '../popup-model.svelte';
	import AddSiteBanner from './AddSiteBanner.svelte';
	import { tr } from '../../shared/i18n/store';
	import CategoryChipsCard from './CategoryChipsCard.svelte';
	import IdentityVaultCard from './IdentityVaultCard.svelte';
	import ImageCheckToggle from './ImageCheckToggle.svelte';
	import OfficeCheckToggle from './OfficeCheckToggle.svelte';
	import LegalCard from './LegalCard.svelte';
	import MaintenanceCard from './MaintenanceCard.svelte';
	import ProtectionStatusCard from './ProtectionStatusCard.svelte';

	let {
		protection,
		categories,
		vault,
		openPrivacyPolicy,
		openTermsOfUse,
		openImpressum
	}: {
		protection: ProtectionModel;
		categories: CategoriesModel;
		vault: VaultModel;
		openPrivacyPolicy: () => void;
		openTermsOfUse: () => void;
		openImpressum: () => void;
	} = $props();
</script>

<div class="pk-stack">
	<p class="pk-fine intro">{$tr('pp.intro')}</p>
	<AddSiteBanner />
	<ProtectionStatusCard
		enabled={protection.enabled}
		wasmStatus={protection.wasmStatus}
		nerStatus={protection.nerStatus}
		cpuFallback={protection.cpuFallback}
		resourceSummary={protection.resourceSummary}
		composerMatch={protection.composerMatch}
		retryLocalAi={protection.retryLocalAi}
		retrying={protection.retrying}
	/>
	<ImageCheckToggle />
	<OfficeCheckToggle />
	<CategoryChipsCard
		categories={categories.categories}
		enabledCount={categories.enabledCount}
		toggleCategory={categories.toggleCategory}
	/>
	<IdentityVaultCard
		memoryEnabled={vault.memoryEnabled}
		consistentReplacementMode={vault.consistentReplacementMode}
		mappingCount={vault.mappingCount}
		setMemoryEnabled={vault.setMemoryEnabled}
		setReplacementMode={vault.setReplacementMode}
		openVaultOptions={vault.openVaultOptions}
	/>
	<MaintenanceCard restoreDefaults={categories.restoreDefaults} clearMappings={vault.clearMappings} />
	<LegalCard {openPrivacyPolicy} {openTermsOfUse} {openImpressum} />
</div>

<style>
	.intro { margin: 0; line-height: 1.45; }
</style>
