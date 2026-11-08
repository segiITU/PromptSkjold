<script lang="ts">
  import type { EntityType } from '../../shared/message-types';
  import { language, tr } from '../../shared/i18n/store';
  import type { OverlayModel } from './overlay-model';
  import OverlayHeader from './components/OverlayHeader.svelte';
  import Papers from './components/Papers.svelte';
  import ImagePane from './components/ImagePane.svelte';
  import FindingList from './components/FindingList.svelte';
  import ConfidenceSlider from './components/ConfidenceSlider.svelte';
  import MarkOverlay from './components/MarkOverlay.svelte';

  let {
    model,
    shadowRoot,
  }: { model: OverlayModel; shadowRoot: ShadowRoot } = $props();

  // Model is created once and passed in as a stable reference for the
  // overlay's lifetime, so destructuring its store fields is safe.
  // svelte-ignore state_referenced_locally
  const { notice, totalCount, enabledCount, view, confidenceThreshold, selectedSnippet, spanStates } = model;

  let sheetEl: HTMLElement | undefined = $state();
  let markWrap: HTMLElement | undefined = $state();
  let seen = $state(false);

  function toggleSpanByIndex(index: number) {
    const current = $spanStates[index];
    if (!current) return;
    model.toggleWithNotice(index, !current.enabled);
  }

  function readSelectionFromOriginal(): string | null {
    const sel =
      (shadowRoot as unknown as { getSelection?: () => Selection | null }).getSelection?.() ??
      window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const container = (range.commonAncestorContainer as Element | Text).nodeType === 1
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
    if (!container || !container.closest('.pg-original-text')) return null;
    const text = sel.toString().trim();
    return text || null;
  }

  $effect(() => {
    function onSelectionChange() {
      model.setSelectedSnippet(readSelectionFromOriginal());
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  });

  // The highlighter sweep plays once when the sheet opens, not on every re-render.
  $effect(() => {
    const timer = setTimeout(() => (seen = true), 1500);
    return () => clearTimeout(timer);
  });

  // Move focus into the dialog so keyboard users start inside it.
  $effect(() => {
    const btn = shadowRoot.getElementById('pg-confirm-btn') as HTMLElement | null;
    btn?.focus({ preventScroll: true });
  });

  const FOCUSABLE =
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  /** Everything Tab may reach: the sheet, then the mark dialog while it is open (it sits outside the sheet). */
  function focusables(): HTMLElement[] {
    const roots = [sheetEl, $selectedSnippet ? markWrap : undefined].filter(Boolean) as HTMLElement[];
    return roots
      .flatMap((root) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)])
      .filter((el) => el.getClientRects().length > 0);
  }

  /**
   * Keep Tab inside the dialog (sheet + open mark dialog), stop Enter on a control from also confirming the
   * review, and let Esc close the mark dialog first before it can cancel the whole review.
   */
  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && $selectedSnippet) {
      event.stopPropagation();
      event.preventDefault();
      model.setSelectedSnippet(null);
      return;
    }
    if (event.key === 'Enter' && target) {
      const tag = target.tagName;
      if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SUMMARY') {
        event.stopPropagation();
      }
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = shadowRoot.activeElement as HTMLElement | null;
    const inside = !!active && items.includes(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onMarkAdd(text: string, type: EntityType) {
    model.addManual(text, type);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pg-overlay-backdrop" lang={$language} onkeydown={onKeydown}>
  <div
    class="pk-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pk-title"
    aria-describedby="pk-sub"
    data-seen={seen ? '' : undefined}
    bind:this={sheetEl}
  >
    <OverlayHeader
      totalCount={$totalCount}
      timingMs={model.timings?.totalMs}
      onClose={() => model.cancel()}
    />

    <div class="pk-body">
      <aside class="pk-finds" aria-label={$tr('ov.findings')}>
        <h3 class="pk-finds-h">{$tr('ov.findings')}</h3>
        <FindingList {model} />
        <details class="pk-sens">
          <summary>{$tr('ov.minConfidence')}</summary>
          <ConfidenceSlider value={$confidenceThreshold} onChange={(v) => model.setThreshold(v)} />
        </details>
      </aside>

      <section class="pk-papers" aria-label={$tr('ov.dialog')}>
        {#if model.options.image}
          <ImagePane {model} />
        {:else}
          <Papers
            original={$view.original}
            result={$view.result}
            anyEnabled={$enabledCount > 0}
            onToggleSpan={toggleSpanByIndex}
          />
        {/if}
      </section>
    </div>

    <div class="pk-notes">
      {#if model.options.title}
        <p class="pk-file" title={model.options.title}>{model.options.title}</p>
      {/if}
      {#each model.options.notes ?? [] as note}
        <p>{note}</p>
      {/each}
      <p>{$tr('common.disclaimer')}</p>
    </div>

    <footer class="pk-foot">
      <div class="pk-foot-left">
        <button type="button" class="pk-btn pk-btn-quiet" title="Esc" onclick={() => model.cancel()}
          >{$tr('common.cancel')}</button
        >
        <button
          type="button"
          class="pk-btn pk-btn-outline"
          onclick={() => model.pasteOriginal()}
        >{model.options.originalLabel ?? $tr('ov.pasteOriginal')}</button>
        {#if model.options.extraAction}
          <button
            type="button"
            class="pk-btn pk-btn-outline"
            title={model.options.extraAction.title}
            onclick={() => model.extraAction()}
          >{model.options.extraAction.label}</button>
        {/if}
      </div>
      <div class="pk-foot-right">
        <span class="pk-summary" aria-live="polite"
          >{$tr('ov.summary', { r: $enabledCount, k: $totalCount - $enabledCount })}</span
        >
        <button
          type="button"
          class="pk-btn pk-btn-primary"
          id="pg-confirm-btn"
          title={$tr('ov.confirmTitle')}
          onclick={() => model.confirm()}
        >{model.options.confirmLabel ?? $tr('ov.confirm')}</button>
      </div>
    </footer>
  </div>

  {#if $notice}
    <div class="pk-toast pg-toast" role="status" aria-live="polite">{$notice}</div>
  {/if}

  {#if $selectedSnippet}
    <div bind:this={markWrap}>
      <MarkOverlay
        snippet={$selectedSnippet}
        onCancel={() => model.setSelectedSnippet(null)}
        onAdd={onMarkAdd}
      />
    </div>
  {/if}
</div>
