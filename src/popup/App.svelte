<script lang="ts">
  import { createAppModels, tabs } from "./popup-model.svelte";
  import { tr } from "../shared/i18n/store";
  import DetectTab from "./components/DetectTab.svelte";
  import ProtectTab from "./components/ProtectTab.svelte";
  import SettingsTab from "./components/SettingsTab.svelte";
  import TestTab from "./components/TestTab.svelte";
  import Toggle from "./components/Toggle.svelte";

  const { navigation, protection, categories, vault, test, settings } = createAppModels();
  const { activeTab, setActiveTab } = navigation;
  const { enabled: protectionEnabled, version, modelLabel } = protection;

  function onTabKeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((tab) => tab.id === $activeTab);
    const next = (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    setActiveTab(tabs[next].id);
    queueMicrotask(() => (document.getElementById(`pk-tab-${tabs[next].id}`) as HTMLElement | null)?.focus());
    event.preventDefault();
  }
</script>

<main class="pk-pop" aria-label="PromptSkjold">
  <header>
    <div class="pk-pop-head">
      <img src="/assets/logo.png" alt="" width="32" height="32" />
      <h1 class="pk-pop-name">
        <span class="wordmark">PromptSkjold</span>
        <small>v{$version}{$modelLabel ? ` · ${$modelLabel}` : ""}</small>
      </h1>
      <Toggle checked={$protectionEnabled} label={$tr("hero.switch")} onchange={(checked) => protection.setEnabled(checked)} />
    </div>

    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="pk-tabs" role="tablist" aria-label={$tr("pp.nav")} tabindex="-1" onkeydown={onTabKeydown}>
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          role="tab"
          id={`pk-tab-${tab.id}`}
          aria-selected={$activeTab === tab.id}
          aria-controls="pk-panel"
          tabindex={$activeTab === tab.id ? 0 : -1}
          onclick={() => setActiveTab(tab.id)}
        >
          {$tr(tab.labelKey)}
        </button>
      {/each}
    </div>
  </header>

  <div class="pk-pop-body" id="pk-panel" role="tabpanel" aria-labelledby={`pk-tab-${$activeTab}`}>
    {#if $activeTab === "protect"}
      <ProtectTab
        {protection}
        {categories}
        {vault}
        openPrivacyPolicy={settings.openPrivacyPolicy}
        openTermsOfUse={settings.openTermsOfUse}
        openImpressum={settings.openImpressum}
      />
    {:else if $activeTab === "detect"}
      <DetectTab {categories} />
    {:else if $activeTab === "test"}
      <TestTab
        testInput={test.testInput}
        isRunning={test.isRunning}
        outcome={test.outcome}
        enabledCount={categories.enabledCount}
        feedbackCounts={test.feedbackCounts}
        runDetection={test.runDetection}
        clearFeedback={test.clearFeedback}
      />
    {:else if $activeTab === "settings"}
      <SettingsTab
        minConfidence={settings.minConfidence}
        debug={settings.debug}
        clipboardInterceptEnabled={settings.clipboardInterceptEnabled}
        nerModel={settings.nerModel}
        nerModelChoice={settings.nerModelChoice}
        nerModelChoices={settings.nerModelChoices}
        sensitivityMode={categories.sensitivityMode}
        feedbackCounts={test.feedbackCounts}
        mappingCount={vault.mappingCount}
        setMinConfidence={settings.setMinConfidence}
        setDebug={settings.setDebug}
        setClipboardInterceptEnabled={settings.setClipboardInterceptEnabled}
        setNerModelChoice={settings.setNerModelChoice}
        openOptions={settings.openOptions}
        openIssueReport={settings.openIssueReport}
        openSecurityReport={settings.openSecurityReport}
        openPrivacySupport={settings.openPrivacySupport}
        openPrivacyPolicy={settings.openPrivacyPolicy}
        openTermsOfUse={settings.openTermsOfUse}
        openImpressum={settings.openImpressum}
        clearFeedback={test.clearFeedback}
        clearMappings={vault.clearMappings}
      />
    {/if}
  </div>

  <footer class="pk-pop-foot">
    <button type="button" class="pk-link-btn" onclick={() => settings.openOptions()}>{$tr("set.more")}</button>
  </footer>
</main>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    margin: 0;
    width: var(--popup-width);
    min-height: var(--popup-height);
  }
  :global(body) {
    background: var(--paper);
  }
  h1 {
    margin: 0;
    font-weight: 400;
  }
</style>
