/**
 * Privacy Guardrail — Content Script
 *
 * Injected into curated LLM chat pages. Orchestrates:
 * 1. Paste interception → WASM detection → review overlay → anonymized insert
 * 2. Response observation → de-anonymization banner → reveal/hide toggle
 * 3. Feedback logging → adaptive threshold computation
 */

import type { SiteAdapter } from './site-adapters/adapter-interface';
import { ChatGptAdapter } from './site-adapters/chatgpt-adapter';
import { ClaudeAdapter } from './site-adapters/claude-adapter';
import { CopilotAdapter } from './site-adapters/copilot-adapter';
import { GeminiAdapter } from './site-adapters/gemini-adapter';
import { GenericAdapter } from './site-adapters/generic-adapter';
import { PasteInterceptor, type ComposerMatch } from './paste-interceptor';
import { SubmitInterceptor } from './submit-interceptor';
import { sendRuntimeMessageBestEffort } from './runtime-messaging';
import { shouldShowCriticalLocalAiModal } from './critical-local-ai-modal-status';
import { ResponseObserver } from './response-observer';
import { ConversationFiler } from './conversation-filing';
import { findLooseTokenAnchors } from './banner-anchor';
import {
  observedTokens,
  readTranscriptText,
  visibleTokens,
} from './transcript-scan';
import { isInEditableRegion } from '../ui/shared/editable-region';
import { ClipboardInterceptor } from './clipboard-interceptor';
import { ReviewOverlay } from '../ui/overlay/overlay';
import { ScanningIndicator } from '../ui/scanning-indicator/scanning-indicator';
import { CancelDecisionDialog } from '../ui/cancel-decision-dialog/cancel-decision-dialog';
import { ImageCheckDialog } from '../ui/image-check-dialog/image-check-dialog';
import { AttachmentInterceptor, type ImageReviewArgs } from './attachment-interceptor';
import { buildReplacedFile, readLocalText, requestPdfRedaction } from './file-review';
import { buildPlainTextCopy } from '../files/text-file';
import { joinNameAndBody, nameForDetection, neutralFileName, splitFileName } from '../files/file-name';
import { fileKind, type LocalFileKind } from '../files/kinds';
import type { Replacement } from '../shared/anonymizer';
import type { DetectionCanceledResponse, PiiResultResponse } from '../shared/message-types';
import type { OverlayOptions } from '../ui/overlay/overlay';
import { resolveSyntheticLocale, type SyntheticLocale } from '../shared/language';
import { CriticalLocalAiModal } from '../ui/critical-local-ai-modal/critical-local-ai-modal';
import { PageStatusChip } from '../ui/page-status-chip/page-status-chip';
import { chipReasonMessageForStatus, deriveChipReason } from '../shared/page-status-chip-reason';
import { SYSTEM_CHECK_STORAGE_KEY } from '../shared/system-check-storage';
import { attachDeAnonBanner, type AttachedBanner } from '../ui/banner/de-anon-banner';
import { anonymize } from '../shared/anonymizer';
import { requestVaultOperation } from '../shared/vault-client';
import { EntityMap } from '../shared/entity-map';
import {
  buildConversationScope,
  emptyScope,
  type ConversationScope,
} from '../shared/conversation-scope';
import {
  loadSettings,
  saveSettings,
  loadConversationRecord,
  saveConversationTokens,
  saveSessionConversationPairs,
  moveConversationTokens,
  conversationRecordExists,
  ownedEntries,
  logFeedback,
  type ConversationRecord,
} from '../shared/storage';
import { findConflictingPattern } from '../shared/list-conflicts';
import {
  type IdentityVaultData,
  type ReplacementMode,
  emptyVaultData,
  loadIdentityVault,
  findRecord,
  activeReplacement,
  inLocale,
  normalizeKey,
} from '../shared/identity-vault';
import { placeholder as makePlaceholder } from '../shared/constants';
import {
  generateSyntheticValue,
  supportsSynthetic,
} from '../shared/synthetic-pool';
import type { PreviewResolverFactory } from '../ui/overlay/overlay';
import {
  computeAdaptiveThresholds,
} from '../shared/feedback';
import { prepareReviewSpans } from './review-spans';
import { requirePiiResult } from '../shared/detection-result';
import { initLanguage, t, tn } from '../shared/i18n/core';
import { FONT_UI } from '../ui/shared/design-tokens.generated';
import { ensurePageFonts } from '../ui/shared/page-fonts';
import { resolveThreshold } from '../shared/sensitivity-resolver';
import { CONVERSATION_URL_POLL_MS, LOCAL_AI_ACTIVITY_HEARTBEAT_MS, NO_PII_INDICATOR_MS, RESPONSE_DEBOUNCE_MS, CHIP_FADE_MS } from '../shared/constants';
import type {
  NerCoverage, OcrResultResponse, PiiSpan, FeedbackEntry, Settings, AllowlistEntry, CancelDetectionBehavior, NerStatus, NerStatusResponse, SystemCompatibilityStatus, SystemCompatibilityStatusResponse } from '../shared/message-types';

// --- Adapter selection ---

function selectAdapter(): SiteAdapter {
  const host = window.location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    return new ChatGptAdapter();
  }
  if (host.includes('claude.ai')) {
    return new ClaudeAdapter();
  }
  if (host.includes('gemini.google.com')) {
    return new GeminiAdapter();
  }
  if (host === 'copilot.microsoft.com' || host === 'copilot.com' || host.endsWith('.copilot.com')) {
    return new CopilotAdapter();
  }
  return new GenericAdapter();
}

// --- State ---

const adapter = selectAdapter();
let entityMap = new EntityMap();
let settings: Settings;
let adaptiveThresholds: Record<string, number> = {};
/**
 * Storage key for the conversation on screen.
 *
 * Not a constant: chat sites create the conversation on the first send and
 * rewrite the URL in place, and users switch conversations without a page
 * load. `watchConversationUrl` keeps it current. Nothing reads meaning into
 * how a URL is shaped — what a change meant is never asked.
 */
let conversationUrl = normalizeConversationUrl(window.location.href);

/**
 * The tab ledger: replacement tokens this page session emitted into a
 * composer.
 *
 * The in-memory map can hold entries restored from storage, and on the "new
 * chat" screen that key is shared with every other tab composing its own
 * first message. Only what this session used is ever filed or persisted —
 * see `ownedEntries`.
 */
const sessionPlaceholders = new Set<string>();

/** What storage knows about the conversation on screen. */
let conversationRecord: ConversationRecord = { tokens: [], originals: {} };

/** Unaltered, vault-known tokens last seen on the page. */
let observedOnPage: string[] = [];

/**
 * What may be resolved on this page, rebuilt whenever any of its three
 * sources moves. Never captured by the surfaces that use it: they hold the
 * resolver and ask again, so a banner attached early is not wrong for the
 * life of the page.
 */
let scope: ConversationScope = emptyScope();

/**
 * Banners currently on the page, so their counts can follow the scope.
 * `loose` marks banners placed by the fallback, not on a matched turn.
 */
const attachedBanners: Array<{ banner: AttachedBanner; loose: boolean }> = [];

/** Tokens already reported as present but unresolvable; reported once each. */
const unresolvableReported = new Set<string>();

function normalizeConversationUrl(href: string): string {
  return href.split('?')[0].split('#')[0];
}
let scanningIndicator: ScanningIndicator | null = null;
let pageStatusChip: PageStatusChip | null = null;
let lastSystemStatus: SystemCompatibilityStatus | null = null;
let lastNerStatus: NerStatus | null = null;
/**
 * How this page's message box was last found, or null before any paste has
 * asked. Set from the paste interceptor, which is the only place that finds
 * out — and only at the moment it matters. See `reportComposerLookup`.
 */
let composerMatch: ComposerMatch | null = null;
let activityListenersStarted = false;
let lastActivityHeartbeatAt = 0;
let releasePasteInterceptor: (() => void) | null = null;
const pasteInterceptorReady = new Promise<void>((resolve) => {
  releasePasteInterceptor = resolve;
});
/**
 * In-memory copy of the identity vault. Loaded once at init, kept up to
 * date by listening for chrome.storage changes (so an edit made in the
 * options page or another tab is visible here without a reload).
 */
let identityVault: IdentityVaultData = emptyVaultData();

function reportSupportedPageActivity(visible: boolean, force = false): void {
  if (visible && !settings?.enabled) return;
  const now = Date.now();
  if (visible && !force && now - lastActivityHeartbeatAt < LOCAL_AI_ACTIVITY_HEARTBEAT_MS) return;
  lastActivityHeartbeatAt = now;
  sendRuntimeMessageBestEffort({
    type: 'SUPPORTED_PAGE_ACTIVITY',
    payload: { visible },
  });
}

function reportUserActivity(): void {
  if (document.visibilityState !== 'visible') return;
  reportSupportedPageActivity(true);
}

function reportVisibility(): void {
  reportSupportedPageActivity(document.visibilityState === 'visible', true);
}

function startSupportedPageActivityHeartbeat(): void {
  if (activityListenersStarted) return;
  activityListenersStarted = true;
  const options: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointermove', reportUserActivity, options);
  window.addEventListener('pointerdown', reportUserActivity, options);
  window.addEventListener('keydown', reportUserActivity, options);
  window.addEventListener('scroll', reportUserActivity, options);
  window.addEventListener('touchstart', reportUserActivity, options);
  window.addEventListener('paste', reportUserActivity, options);
  window.addEventListener('focus', reportVisibility, options);
  window.addEventListener('blur', () => reportSupportedPageActivity(false, true), options);
  window.addEventListener('pagehide', () => reportSupportedPageActivity(false, true), options);
  document.addEventListener('visibilitychange', reportVisibility);
  reportVisibility();
}

// --- UI indicator ---

async function maybeShowCriticalLocalAiModal(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SYSTEM_COMPATIBILITY_STATUS' }) as SystemCompatibilityStatusResponse;
    const status = response?.payload;
    if (!shouldShowCriticalLocalAiModal(status)) {
      return;
    }

    const modal = new CriticalLocalAiModal(settings.theme, {
      onDismiss: async () => {
        await chrome.runtime.sendMessage({ type: 'DISMISS_CRITICAL_LOCAL_AI_MODAL' });
      },
      onOpenSettings: async () => {
        const url = chrome.runtime.getURL('options/options.html');
        await chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', payload: { url } });
      },
    });
    modal.show();
  } catch (err) {
    if (settings?.debug) {
      console.warn('[PG:content] Failed to show Local AI resource modal', err);
    }
  }
}

/**
 * Refresh the chip from the latest cached system-compatibility + NER state.
 * This must never trigger model loading or any other heavy probe — callers
 * pass status they already received from background broadcasts/storage
 * events or from the lightweight GET_SYSTEM_COMPATIBILITY_STATUS read.
 */
function refreshPageStatusChip(): void {
  if (!pageStatusChip) return;
  const reason = deriveChipReason({
    status: lastSystemStatus,
    nerStatus: lastNerStatus,
    composerMissing: composerMatch === 'none',
  });
  pageStatusChip.update(reason, reason ? chipReasonMessageForStatus(reason, lastSystemStatus) : undefined);
}

/**
 * Record how this page's message box was found.
 *
 * A site can change its DOM at any time, and the worst failure mode available
 * to a privacy tool is the silent one: initialization succeeds, the chip
 * stays green, and every paste goes through unreviewed with nothing said.
 * Three outcomes are distinguished because they mean three different things
 * to the user — protected, protected on a guess, and not protected — and the
 * strongest warning keeps its meaning only if the middle case has its own.
 */
function reportComposerLookup(match: ComposerMatch): void {
  if (match === 'none') {
    // Unconditional, NOT behind `settings.debug`: reaching here means text
    // reached the page without review, or reviewed text never landed. The
    // page's own UI shows nothing either way.
    console.warn(
      '[PG:content] No message box found on this page — neither the one this '
        + 'site adapter knows nor the target of the paste. Text here is not '
        + 'reviewed, and reviewed text has nowhere to be inserted.',
    );

    // The chip owns this surface: it appears on this same paste and says the
    // same thing, and a centred indicator on top of it only covers the text
    // it duplicates. Fall back to the indicator when there is no chip to
    // speak through — a paste that beats `init()` to the chip, or an `init()`
    // that failed before building one.
    if (!pageStatusChip) {
      showIndicator(
        t('ind.noComposer'),
        INIT_FAILURE_INDICATOR_MS,
      );
    }
  }

  if (composerMatch === match) return;
  composerMatch = match;
  refreshPageStatusChip();
}

async function probeNerStatusIfSafe(): Promise<void> {
  // Probe only when the model is already loaded so we can read its device
  // (WebGPU vs CPU/WASM). When Local AI is off or the model has not been
  // initialized, skip the probe — the chip should not cause an offscreen
  // boot or a model load just to render a status string.
  const safeToProbe = lastSystemStatus?.localAiState !== 'off-user-choice'
    && lastSystemStatus?.localAiState !== 'off-low-memory-auto'
    && lastSystemStatus?.localAiState !== 'off-load-failure'
    && lastSystemStatus?.runtimeState === 'ready';
  if (!safeToProbe) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_NER_STATUS' }) as NerStatusResponse;
    lastNerStatus = response?.payload ?? null;
    refreshPageStatusChip();
  } catch {
    // Ignore probe failures — the chip continues to render whatever
    // SystemCompatibilityStatus already justifies.
  }
}

async function refreshSystemStatusFromBackground(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SYSTEM_COMPATIBILITY_STATUS' }) as SystemCompatibilityStatusResponse;
    lastSystemStatus = response?.payload ?? null;
    refreshPageStatusChip();
    void probeNerStatusIfSafe();
  } catch {
    // Background unavailable; chip will appear on the next storage update.
  }
}

/**
 * Longer than the routine indicators: this one reports that protection is
 * off, so it must survive a glance away from the screen.
 */
const INIT_FAILURE_INDICATOR_MS = 8000;

function showIndicator(text: string, durationMs: number): void {
  ensurePageFonts();
  const existing = document.getElementById('pg-indicator');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'pg-indicator';
  el.textContent = text;
  // Theme-aware palette: dark uses the deep navy pill, light uses a flat
  // white pill with a subtle border. Falls back to the dark style when
  // settings haven't been loaded yet (very first paste at init time).
  const isLight = settings?.theme === 'light';
  const background = isLight ? '#ffffff' : '#1a1a2e';
  const color = isLight ? '#1f2933' : '#e0e0e0';
  const border = isLight ? '1px solid #e4e6eb' : 'none';
  const shadow = isLight
    ? '0 1px 4px rgba(15, 23, 42, 0.08)'
    : '0 2px 12px rgba(0,0,0,0.3)';
  el.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: ${background}; color: ${color}; padding: 8px 16px;
    border: ${border};
    border-radius: 8px; font-size: 13px; z-index: 2147483646;
    box-shadow: ${shadow}; font-family: ${FONT_UI};
    transition: opacity 0.3s; pointer-events: none;
  `;
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

/**
 * Keep `conversationUrl` in step with same-document navigation.
 *
 * Content scripts run in an isolated world, so patching `history.pushState`
 * here would never observe the page's own calls. Polling the URL is the
 * dependable option; `popstate` is added so back/forward registers at once.
 */
function watchConversationUrl(): void {
  const check = (): void => {
    const next = normalizeConversationUrl(window.location.href);
    if (next === conversationUrl) return;
    conversationUrl = next;
    void adoptConversation(next);
  };

  window.addEventListener('popstate', check);
  window.setInterval(check, CONVERSATION_URL_POLL_MS);
}

/**
 * Pick up whatever is known about the conversation now on screen.
 *
 * Nothing here decides what the URL change meant. The one question asked is
 * whether a record already exists under the incoming URL, and it is asked for
 * a single purpose: a key that has been on screen as its own conversation
 * before is positive proof that this is a switch, and that is the only thing
 * that clears the tab ledger. Every other URL change leaves the ledger
 * standing, so a conversation the site has just named keeps the tokens
 * composed into it.
 */
async function adoptConversation(next: string): Promise<void> {
  if (await conversationRecordExists(next)) {
    sessionPlaceholders.clear();
    filer.reset();
    if (settings?.debug) {
      console.log(`[PG:content] ${next} is a conversation on record; tab ledger cleared`);
    }
  }
  await loadConversationScope();
  scanPage();
}

/**
 * Read the record for the conversation on screen and rebuild the scope.
 *
 * A read that finishes after the page has moved on is discarded. It could
 * only misdirect what resolves — records hold tokens, not originals — but
 * nothing would come along to correct it.
 */
async function loadConversationScope(): Promise<void> {
  const url = conversationUrl;
  const loaded = await loadConversationRecord(url);
  if (url !== conversationUrl) return;

  conversationRecord = loaded;
  if (!settings?.identityVaultEnabled) {
    // With cross-session memory off the record is the only copy of these
    // originals, and it also carries the numbering the anonymizer continues
    // from. With it on, the vault owns both.
    entityMap = new EntityMap({
      ...loaded.originals,
      ...ownedEntries(entityMap.toStored(), sessionPlaceholders),
    });
  }
  rebuildScope();
}

/** This page session's ledger as `token -> original` pairs. */
function ledgerEntries(): Record<string, string> {
  return ownedEntries(entityMap.toStored(), sessionPlaceholders);
}

/**
 * Recompose what may be resolved, and let every surface that shows it catch
 * up. Cheap and pure, so it runs on every change rather than being kept in
 * step by hand.
 */
function rebuildScope(): void {
  scope = buildConversationScope({
    recordTokens: conversationRecord.tokens,
    recordOriginals: conversationRecord.originals,
    ledger: ledgerEntries(),
    observed: observedOnPage,
    vault: identityVault,
    vaultEnabled: settings?.identityVaultEnabled ?? false,
  });
  refreshBanners();
}

/**
 * Files this tab's tokens under whichever conversation they turn up in.
 *
 * The transcript is re-read here rather than reused from the last scan: the
 * filer runs after a paste and after a URL change as well as from the scan,
 * and a move is worth being sure about.
 */
const filer = new ConversationFiler({
  ledger: () => sessionPlaceholders,
  observe: (tokens) =>
    visibleTokens(tokens, readTranscriptText(document.body, adapter.getInputElement())),
  currentUrl: () => conversationUrl,
  move: (from, to, tokens) => moveConversationTokens(from, to, tokens),
  onMoved: (from, to, tokens) => {
    if (settings?.debug) {
      console.log(
        `[PG:content] ${tokens.length} token(s) seen at ${to}; moved there from ${from}`,
      );
    }
  },
});

/**
 * Read the page and act on what is there: admit unaltered tokens the vault
 * knows, file this tab's tokens under the conversation they are rendered in,
 * and offer a banner wherever something resolves.
 *
 * Runs on debounced transcript mutation, on URL change and after a paste.
 * Every part of it is idempotent, so no single run has to be the right one.
 */
function scanPage(): void {
  if (!document.body) return;
  // A profile that has never replaced anything has nothing to observe, file
  // or reveal, and this runs on every page mutation. Leave before the walk.
  if (
    sessionPlaceholders.size === 0
    && identityVault.records.length === 0
    && scope.size === 0
  ) {
    return;
  }

  const composer = adapter.getInputElement();
  const transcript = readTranscriptText(document.body, composer);

  const seen = observedTokens(transcript);
  const admitted = seen.filter((token) => vaultKnows(token));
  if (!sameTokens(admitted, observedOnPage)) {
    observedOnPage = admitted;
    rebuildScope();
  }
  reportUnresolvableTokens(seen);

  void filer.run();

  attachLooseBanners(composer, transcript);
}

/** Whether the identity vault can supply an original for `token`. */
function vaultKnows(token: string): boolean {
  if (!settings?.identityVaultEnabled) return false;
  return identityVault.records.some(
    (record) => record.placeholder === token || record.syntheticValue === token,
  );
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const known = new Set(b);
  return a.every((token) => known.has(token));
}

/**
 * Note a token the user can see that this extension will not resolve.
 *
 * Deliberately a `console.debug` and nothing else. It is the one signal that
 * a conversation has drifted out of scope, and it belongs to whoever is
 * debugging that — telling the user about a token nothing can be done with
 * would be noise where the extension is already doing its best.
 */
function reportUnresolvableTokens(seen: readonly string[]): void {
  for (const token of seen) {
    if (scope.has(token) || unresolvableReported.has(token)) continue;
    unresolvableReported.add(token);
    console.debug(
      `[PG:content] ${token} is on this page but no original is known for it.`,
    );
  }
}

/**
 * Offer a banner on any region holding a resolvable token, but only when the
 * adapter's reply selectors match nothing on the page.
 *
 * This is what a rotted selector costs: precision. The banner lands on a
 * block the token sits in rather than on the reply the site knows it to be
 * part of, and it reads inert text only — but it appears, which is the whole
 * difference between a redesign costing polish and costing the feature.
 *
 * If the adapter finds any replies, we trust it to find all of them. A token
 * outside them is then in the user's message, a sidebar title or similar, not
 * in a reply. So the fallback stays off, and its banners from before the first
 * reply matched are removed.
 */
function attachLooseBanners(composer: HTMLElement | null, transcript: string): void {
  if (adapter.canTellReplies === false) return;

  const turns = adapter.getResponseElements();
  if (turns.length > 0) {
    detachLooseBanners();
    return;
  }

  // One check over the text already in hand, rather than a walk that asks the
  // same question of every node on the page and finds nothing.
  if (scope.size === 0 || !scope.mightResolve(transcript)) return;

  const anchors = findLooseTokenAnchors(
    document.body,
    turns,
    composer,
    (text) => scope.mightResolve(text) && scope.resolve(text).matches.length > 0,
    adapter.getUserMessageElements?.() ?? [],
  );
  for (const anchor of anchors) {
    attachBanner(anchor, false);
  }
}

function detachLooseBanners(): void {
  for (let i = attachedBanners.length - 1; i >= 0; i--) {
    const { banner, loose } = attachedBanners[i];
    if (!loose) continue;
    banner.detach();
    attachedBanners.splice(i, 1);
  }
}

/**
 * Attach a banner, remembering it so its count can follow the scope.
 *
 * The composer is refused here as well as inside the banner. The banner knows
 * what an editable element looks like; only the adapter knows which element
 * this site's message box is, and a turn selector that has rotted onto it
 * must not end up with a reveal control over text the user is about to send.
 *
 * Only banners on a matched turn read form controls. The others are loose,
 * and `detachLooseBanners` may remove them later.
 */
function attachBanner(element: HTMLElement, onMatchedTurn: boolean): boolean {
  if (isInEditableRegion(element, adapter.getInputElement())) return false;

  const banner = attachDeAnonBanner(element, (text) => scope.resolve(text), {
    theme: settings?.theme,
    readFormControls: onMatchedTurn,
  });
  if (!banner) return false;
  attachedBanners.push({ banner, loose: !onMatchedTurn });
  return true;
}

/**
 * Bring every banner up to date with the current scope, and offer one to
 * replies that had nothing resolvable when they arrived.
 *
 * The second half matters as much as the first: a reply that streamed in
 * before its conversation's record finished loading was passed over, and
 * without this it would stay passed over until the next mutation.
 */
function refreshBanners(): void {
  for (let i = attachedBanners.length - 1; i >= 0; i--) {
    const { banner } = attachedBanners[i];
    if (!banner.element.isConnected) {
      attachedBanners.splice(i, 1);
      continue;
    }
    banner.refresh();
  }

  if (scope.size === 0) return;
  for (const element of adapter.getResponseElements()) {
    attachBanner(element, true);
  }
}

/**
 * Write this session's tokens under the conversation they were emitted in,
 * then let filing move them if the site renames it.
 *
 * With cross-session memory on, only the tokens are written: the identity
 * vault holds the originals, and a record filed against the wrong
 * conversation then costs precision rather than disclosure. With it off the
 * vault is holding nothing, so the pairs go to session storage — enough to
 * survive a reload and a conversation switch, and gone when the browser
 * closes, which is what the setting's name promises.
 */
async function recordEmittedTokens(): Promise<void> {
  const url = conversationUrl;
  const entries = ledgerEntries();
  const tokens = Object.keys(entries);
  if (tokens.length === 0) return;

  if (settings?.identityVaultEnabled) {
    await saveConversationTokens(url, tokens);
  } else {
    await saveSessionConversationPairs(url, entries);
  }
  filer.noteFiled(url, tokens);

  // The send that follows a paste is what renames the conversation, so this
  // is the moment filing most often has work to do.
  await filer.run();
}

/**
 * Follow a change to the cross-session memory setting.
 *
 * Turning it on brings originals back into reach for every token already
 * filed; turning it off takes them out of reach again. Either way what may be
 * resolved on this page changes, and the surfaces showing it have to be told.
 */
async function reloadVaultAndScope(): Promise<void> {
  identityVault = settings?.identityVaultEnabled
    ? await loadIdentityVault()
    : emptyVaultData();
  await loadConversationScope();
  scanPage();
}

/**
 * Watch the whole page rather than the adapter's reply elements.
 *
 * Filing and observation must keep working when the reply selectors rot, so
 * neither may be driven by them. `document.body` is coarse; the debounce and
 * the early exits in `scanPage` are what make it affordable.
 */
function watchTranscript(): void {
  let timer: number | null = null;
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      scanPage();
    }, RESPONSE_DEBOUNCE_MS);
  };

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  schedule();
}

function waitForDocumentBody(): Promise<void> {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

// --- Review overlay integration ---

/**
 * Build a preview-only resolver that mirrors what `anonymizeWithVault`
 * would emit, without mutating the live vault. Records already in the
 * vault use their stored replacementMode; new identities follow the
 * current global default. The factory returns a fresh resolver with per-
 * pass dedup state, so each call to `buildPreview` starts clean.
 */
function makePreviewResolverFactory(
  vault: IdentityVaultData,
  defaultMode: ReplacementMode,
  locale: SyntheticLocale,
): PreviewResolverFactory {
  return () => {
    const seen = new Map<string, string>();
    const pendingByType = new Map<string, number>();
    return (span) => {
      const existing = findRecord(vault, span.text, span.entity_type);
      if (existing) return activeReplacement(inLocale(existing, locale), defaultMode);
      const key = `${span.entity_type}|${normalizeKey(span.text)}`;
      const cached = seen.get(key);
      if (cached) return cached;
      const baseCounter = vault.counters[span.entity_type] ?? 0;
      const offset = pendingByType.get(span.entity_type) ?? 0;
      pendingByType.set(span.entity_type, offset + 1);
      const idx = baseCounter + offset + 1;
      const ph = makePlaceholder(span.entity_type, idx);
      const synth = supportsSynthetic(span.entity_type)
        ? generateSyntheticValue(span.entity_type, baseCounter + offset, { locale })
        : null;
      const rendered = defaultMode === 'synthetic' && synth ? synth : ph;
      seen.set(key, rendered);
      return rendered;
    };
  };
}

/**
 * Where the outcome of a review goes. A paste review inserts text into the
 * composer; a submit review replaces the composer text and sends it.
 */
interface ReviewSink {
  original(text: string): void;
  anonymized(text: string, replacements?: Replacement[]): void;
  /** Takes the approved items instead of replacing them in the text (images are blacked out, not rewritten). */
  confirm?(approved: PiiSpan[]): void;
  /** The extra action of the review (for files) was chosen. */
  extra?(approved: PiiSpan[]): void;
  /** User dismissed the overlay without choosing. */
  cancelled(originalText: string): void;
}

const pasteSink: ReviewSink = {
  original: (text) => interceptor.pasteOriginal(text),
  anonymized: (text) => interceptor.pasteAnonymized(text),
  cancelled: (originalText) => {
    void chooseAfterExplicitScanCancel().then((decision) => {
      if (decision === 'paste-original') {
        interceptor.pasteOriginal(originalText);
      }
      if (settings.debug) {
        console.log(`[PG:content] Overlay cancelled, ${decision === 'paste-original' ? 'original pasted' : 'nothing pasted'}`);
      }
    });
  },
};

const submitSink: ReviewSink = {
  original: () => submitInterceptor.submitOriginal(),
  anonymized: (text) => submitInterceptor.submitReplaced(text),
  cancelled: () => {
    submitInterceptor.abandon();
    showIndicator(t('ind.notSent'), NO_PII_INDICATOR_MS);
  },
};

function showReviewOverlay(
  originalText: string,
  rawSpans: PiiSpan[],
  timings?: { totalMs: number },
  sink: ReviewSink = pasteSink,
  options?: OverlayOptions,
): void {
  const reviewedUrl = normalizeConversationUrl(window.location.href);
  const reviewedPasteVersion = interceptor.reviewVersion;
  const reviewStillCurrent = (): boolean => {
    if (normalizeConversationUrl(window.location.href) !== reviewedUrl
      || (sink === pasteSink && !interceptor.isCurrentReview(reviewedPasteVersion))) {
      // A stale paste must never ask to insert its original at a newer paste's selection.
      if (sink !== pasteSink) sink.cancelled(originalText);
      showIndicator(t('review.changed'), 5000);
      return false;
    }
    return sink !== submitSink || submitInterceptor.isCurrentReview();
  };
  const spans = prepareReviewSpans(originalText, rawSpans, settings, adaptiveThresholds);

  if (spans.length === 0) {
    if (options?.notes?.length) {
      // Filtering findings must not discard an attachment's incomplete-check warning.
      void new ImageCheckDialog(settings.theme).show({
        fileName: options.title ?? '', items: [], notes: options.notes, canRedact: false,
      }).then(decision => {
        if (!reviewStillCurrent()) return;
        if (decision === 'attach') sink.original(originalText);
        else sink.cancelled(originalText);
      });
      return;
    }
    // After filtering, nothing left — paste original
    showIndicator(t('ind.nothingActionable'), NO_PII_INDICATOR_MS);
    sink.original(originalText);
    return;
  }

  const overlay = new ReviewOverlay(
    originalText,
    spans,
    {
      onConfirm: async (approvedSpans: PiiSpan[]) => {
        if (!reviewStillCurrent()) return;
        if (approvedSpans.length === 0) {
          sink.original(originalText);
          return;
        }

        if (sink.confirm) {
          sink.confirm(approvedSpans);
          return;
        }

        let anonymizedText: string;
        let replacements: Replacement[];

        if (settings.identityVaultEnabled) {
          // Allocate and persist through the one background owner before emitting any token.
          try {
            const result = await requestVaultOperation({
              kind: 'anonymize', text: originalText, spans: approvedSpans,
              mode: settings.defaultReplacementMode,
              locale: resolveSyntheticLocale(settings.syntheticLocale, originalText),
            });
            if (!reviewStillCurrent()) return;
            if (result.text === undefined || !result.replacements || !result.entries) throw new Error('Invalid vault response.');
            for (const [replacement, original] of result.entries) entityMap.addExternal(replacement, original);
            anonymizedText = result.text;
            replacements = result.replacements;
            identityVault = result.vault;
          } catch (error) {
            showIndicator(t('ind.error', { msg: String(error) }), 5000);
            sink.cancelled(originalText);
            return;
          }
        } else {
          // Legacy path: per-conversation EntityMap only.
          const result = anonymize(originalText, approvedSpans, entityMap);
          entityMap = result.entityMap;
          anonymizedText = result.text;
          replacements = result.replacements;
        }

        sink.anonymized(anonymizedText, replacements);

        // Record what this session put into the page. The map may also hold
        // entries restored from storage — on the shared "new chat" key those
        // can belong to another tab's draft — and those are not ours to
        // persist or file.
        for (const [replacement] of entityMap.entries()) {
          if (anonymizedText.includes(replacement)) {
            sessionPlaceholders.add(replacement);
          }
        }

        // The ledger just grew, so what may be resolved on this page grew
        // with it — before anything has been written anywhere.
        rebuildScope();
        void recordEmittedTokens();

        showIndicator(
          tn('ind.replaced', approvedSpans.length),
          CHIP_FADE_MS,
        );

        if (settings.debug && timings) {
          console.log(`[PG:content] Detection: ${timings.totalMs}ms, anonymized ${approvedSpans.length} spans`);
        }
      },

      onPasteOriginal: () => {
        if (!reviewStillCurrent()) return;
        sink.original(originalText);
      },

      onCancel: () => {
        if (!reviewStillCurrent()) return;
        sink.cancelled(originalText);
      },

      onExtraAction: (approvedSpans: PiiSpan[]) => {
        if (!reviewStillCurrent()) return;
        sink.extra?.(approvedSpans);
      },

      onFeedback: (entry: FeedbackEntry) => {
        logFeedback(entry);
        // Recompute adaptive thresholds in background
        computeAdaptiveThresholds(settings.minConfidence).then((t) => {
          adaptiveThresholds = t;
        });

        if (settings.debug) {
          console.log('[PG:content] Feedback logged:', entry.correctedType);
        }
      },

      onAddToAllowlist: (text: string) => {
        const conflict = findConflictingPattern(text, settings.blocklist);
        if (conflict) {
          showIndicator(
            t('ind.onBlocklist', { v: conflict }),
            3000,
          );
          return;
        }

        const entry: AllowlistEntry = {
          pattern: text,
          scope: 'any',
          addedAt: Date.now(),
          source: 'detection',
        };
        const updated = [...settings.allowlist, entry];
        settings = { ...settings, allowlist: updated };
        saveSettings({ allowlist: updated });
      },

      onEditDetails: (text: string) => {
        const url = chrome.runtime.getURL(`options/options.html?allowlist=${encodeURIComponent(text)}`);
        sendRuntimeMessageBestEffort({ type: 'OPEN_OPTIONS_PAGE', payload: { url } });
      },
    },
    (span: PiiSpan) => resolveThreshold(settings, span.entity_type),
    timings,
    settings.theme,
    settings.identityVaultEnabled
      ? makePreviewResolverFactory(
          identityVault,
          settings.defaultReplacementMode,
          resolveSyntheticLocale(settings.syntheticLocale, originalText),
        )
      : undefined,
    options,
  );

  overlay.show();
}

// --- Paste interceptor ---

/** Tell the user when a very large paste was only partly read by the AI model. */
function reportPartialCoverage(coverage: NerCoverage): void {
  const read = coverage.totalChunks - coverage.skippedNonProse;
  const pct = read > 0 ? Math.round((coverage.scannedChunks / read) * 100) : 100;
  showIndicator(
    coverage.reason === 'model-unavailable' ? t('scan.partialCoverage') : t('ind.large', { pct }),
    7000,
  );
}

async function chooseAfterExplicitScanCancel(): Promise<'paste-original' | 'drop'> {
  const behavior: CancelDetectionBehavior = settings?.cancelDetectionBehavior ?? 'ask';

  if (behavior === 'paste-original') {
    showIndicator(t('ind.pastedUnchecked'), NO_PII_INDICATOR_MS);
    return 'paste-original';
  }

  if (behavior === 'drop') {
    showIndicator(t('ind.canceledNothing'), NO_PII_INDICATOR_MS);
    return 'drop';
  }

  const result = await new CancelDecisionDialog(settings?.theme ?? 'dark').show();
  if (result.remember && !result.dismissed) {
    const nextBehavior: CancelDetectionBehavior = result.decision === 'paste-original'
      ? 'paste-original'
      : 'drop';
    await saveSettings({ cancelDetectionBehavior: nextBehavior });
    settings = { ...settings, cancelDetectionBehavior: nextBehavior };
  }

  if (result.decision === 'paste-original') {
    showIndicator(t('ind.pastedUnchecked'), NO_PII_INDICATOR_MS);
  } else {
    showIndicator(t('ind.canceledNothing'), NO_PII_INDICATOR_MS);
  }

  return result.decision;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** The same file under another name (the bytes are not copied until they are read). */
function renamedFile(file: File, name: string): File {
  return name === file.name ? file : new File([file], name, { type: file.type });
}

/** A copy of the image with the given pixel boxes painted over. `name` is what the copy's name is built from. */
async function redactImage(
  file: File,
  boxes: Array<{ x0: number; y0: number; x1: number; y1: number }>,
  name = file.name,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas available.');
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = '#000';
    const pad = Math.max(3, Math.round(bitmap.height / 300));
    for (const b of boxes) context.fillRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not write the redacted image.');
    return new File([blob], name.replace(/\.[^.]+$/, '') + '-redacted.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

/** A file that has not been read after this long is reported as a problem. */
const SCAN_TIMEOUT_MS = 3 * 60_000;

let ocrIndicator: ScanningIndicator | null = null;
let cancelActiveOcr: (() => void) | null = null;

/** Office and text files: read here, then detected like pasted text. */
async function scanLocalFile(file: File, kind: LocalFileKind): Promise<OcrResultResponse['payload']> {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  const text = await readLocalText(file, kind);
  const response = (await chrome.runtime.sendMessage({
    type: 'DETECT_PII',
    payload: { requestId, text },
  })) as (PiiResultResponse & { error?: string }) | DetectionCanceledResponse | undefined;
  const result = requirePiiResult(response);
  const spans = result.payload.spans;
  return {
    requestId,
    status: 'ok',
    text,
    spans,
    boxes: spans.map(() => []),
    nerCoverage: result.payload.timings?.nerCoverage,
    meanConfidence: 0,
    ms: Math.round(performance.now() - started),
  };
}

/**
 * The approved items replaced in the text that was read, for a file whose pages cannot be blacked out.
 * Same allocation and bookkeeping as the review's "replace" path, so a reply that uses the placeholders is still resolved.
 */
async function anonymizeForTextCopy(text: string, approved: PiiSpan[]): Promise<Replacement[]> {
  let replacements: Replacement[];
  let anonymizedText: string;
  if (settings.identityVaultEnabled) {
    const result = await requestVaultOperation({
      kind: 'anonymize', text, spans: approved,
      mode: settings.defaultReplacementMode,
      locale: resolveSyntheticLocale(settings.syntheticLocale, text),
    });
    if (result.text === undefined || !result.replacements || !result.entries) throw new Error('Invalid vault response.');
    for (const [replacement, original] of result.entries) entityMap.addExternal(replacement, original);
    anonymizedText = result.text;
    replacements = result.replacements;
    identityVault = result.vault;
  } else {
    const result = anonymize(text, approved, entityMap);
    entityMap = result.entityMap;
    anonymizedText = result.text;
    replacements = result.replacements;
  }
  for (const [replacement] of entityMap.entries()) {
    if (anonymizedText.includes(replacement)) sessionPlaceholders.add(replacement);
  }
  rebuildScope();
  void recordEmittedTokens();
  return replacements;
}

/**
 * Blacked-out copy of a PDF; asks before attaching one that still shows some items.
 * `body` is the text that was read from the PDF, which the approved items refer to: with it, the user may
 * attach an anonymised text copy instead.
 */
async function blackOutPdf(file: File, approved: PiiSpan[], name = file.name, body?: string): Promise<File | null> {
  const items = [...new Set(approved.map((span) => span.text))];
  const requestId = crypto.randomUUID();
  let canceled = false;
  const indicator = new ScanningIndicator(
    settings?.theme ?? 'dark',
    () => {
      canceled = true;
      void chrome.runtime.sendMessage({ type: 'CANCEL_DETECTION', payload: { requestId } }).catch(() => undefined);
      indicator.stop();
    },
    'Blacking out the PDF',
  );
  indicator.start();
  let outcome;
  try {
    outcome = await requestPdfRedaction(file, items, requestId, name);
  } finally {
    indicator.stop();
  }
  if (canceled) return null;
  if (!outcome.file) {
    showIndicator(t('ind.pdfFail', { detail: outcome.message ? ` (${outcome.message})` : '' }), 5000);
    return null;
  }
  if (outcome.missed.length > 0) {
    const decision = await new ImageCheckDialog(settings?.theme ?? 'dark').show({
      fileName: file.name,
      items: [],
      problem: tn('ic.problemPages', outcome.missed.length),
      missed: outcome.missed,
      canTextCopy: body !== undefined,
    });
    if (decision === 'text' && body !== undefined) {
      try {
        return buildPlainTextCopy(name, body, await anonymizeForTextCopy(body, approved));
      } catch (error) {
        showIndicator(t('ind.copyFail', { msg: error instanceof Error ? error.message : String(error) }), 5000);
        return null;
      }
    }
    return decision === 'attach' ? outcome.file : null;
  }
  return outcome.file;
}

/**
 * The review of an image: the same overlay as for text, with the picture where the
 * text would be. Confirming blacks out the approved items; nothing is written to
 * the identity vault because nothing is replaced by a value.
 */
function reviewImageFile(args: ImageReviewArgs): Promise<File | null> {
  const { file, spans, boxes, nameSpans, position } = args;
  // A name with personal data is reviewed in the same overlay, in front of the text read from the picture.
  const joined = joinNameAndBody(t('ov.fileNameLabel'), file.name, nameSpans, args.text, spans);
  const url = URL.createObjectURL(file);
  const boxesByKey = new Map(spans.map((span, i) => [`${span.start}:${span.end}`, boxes[i] ?? []]));
  const boxesFor = (span: PiiSpan) => {
    if (joined.isName(span)) return [];
    const own = joined.unshift(span);
    return boxesByKey.get(`${own.start}:${own.end}`) ?? [];
  };
  return new Promise<File | null>((resolve) => {
    const finish = (result: File | null): void => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const sink: ReviewSink = {
      original: () => finish(file),
      anonymized: () => finish(null),
      cancelled: () => finish(null),
      confirm: (approved) => {
        void (async () => {
          // Nothing is replaced by a value here, so a name with personal data in it is swapped for a neutral one.
          const copyName = approved.some(joined.isName) ? neutralFileName(file.name, position.index) : file.name;
          const inText = approved.filter((span) => !joined.isName(span));
          const places = inText.flatMap(boxesFor);
          const missed = inText.filter((span) => boxesFor(span).length === 0).length;
          if (missed > 0) {
            const decision = await new ImageCheckDialog(settings?.theme ?? 'dark').show({
              fileName: file.name,
              items: [],
              problem:
                places.length === 0
                  ? t('ic.problemNone')
                  : tn('ic.problemPicture', missed),
            });
            if (decision !== 'attach') return finish(null);
            if (places.length === 0) return finish(renamedFile(file, copyName));
          }
          try {
            // Only the name was approved: nothing to paint over, the picture goes on under its new name.
            finish(places.length === 0 && inText.length === 0 ? renamedFile(file, copyName) : await redactImage(file, places, copyName));
          } catch (error) {
            showIndicator(t('ind.imageFail', { msg: error instanceof Error ? error.message : String(error) }), 5000);
            finish(null);
          }
        })();
      },
    };
    showReviewOverlay(joined.text, joined.spans, undefined, sink, {
      title: position.total > 1 ? t('ov.fileTitle', { i: position.index, total: position.total, name: file.name }) : file.name,
      originalLabel: t('ov.attachOriginal'),
      confirmLabel: t('ov.blackoutAttach'),
      image: { url, boxesFor },
    });
  });
}

// Reads images, PDFs, Word, Excel, PowerPoint and text files; images and scanned pages use the optional local OCR pack.
const attachmentInterceptor = new AttachmentInterceptor({
  reviewImage: reviewImageFile,
  scanName: async (fileName) => {
    // Only the part before the extension, with underscores read as spaces (same length, so positions hold).
    const stem = nameForDetection(splitFileName(fileName).stem);
    if (stem.trim() === '') return [];
    const response = (await chrome.runtime.sendMessage({
      type: 'DETECT_PII',
      payload: { requestId: crypto.randomUUID(), text: stem },
    })) as (PiiResultResponse & { error?: string }) | DetectionCanceledResponse | undefined;
    return requirePiiResult(response).payload.spans;
  },
  reviewText: ({ file, kind, text, spans, nameSpans, notes, canBlackout, position }) =>
    new Promise<File | null>((resolve) => {
      // A name with personal data is reviewed in the same overlay, in front of the text.
      const joined = joinNameAndBody(t('ov.fileNameLabel'), file.name, nameSpans, text, spans);
      const sink: ReviewSink = {
        original: () => resolve(file),
        anonymized: (_text, replacements) => {
          buildReplacedFile(file, kind, text, joined.bodyReplacements(replacements ?? []), joined.fileName(replacements ?? [])).then(resolve, (error) => {
            showIndicator(t('ind.copyFail', { msg: error instanceof Error ? error.message : String(error) }), 5000);
            resolve(null);
          });
        },
        extra: (approved) => {
          const copyName = approved.some(joined.isName) ? neutralFileName(file.name, position.index) : file.name;
          const inText = joined.bodySpans(approved);
          // Only the name was approved: there is nothing to black out, the PDF goes on under its new name.
          if (inText.length === 0) return resolve(renamedFile(file, copyName));
          void blackOutPdf(file, inText, copyName, text).then(resolve);
        },
        cancelled: () => resolve(null),
      };
      showReviewOverlay(joined.text, joined.spans, undefined, sink, {
        title: position.total > 1 ? t('ov.fileTitle', { i: position.index, total: position.total, name: file.name }) : file.name,
        originalLabel: t('ov.attachOriginal'),
        confirmLabel: t('ov.replaceAttach'),
        notes,
        extraAction: canBlackout
          ? { label: t('ov.attachBlackedPdf'), title: t('ov.attachBlackedPdfTitle') }
          : undefined,
      });
    }),
  scan(file) {
    const kind = fileKind(file);
    if (kind === 'text' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx') return scanLocalFile(file, kind);
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      cancelActiveOcr = () => {
        cancelActiveOcr = null;
        void chrome.runtime.sendMessage({ type: 'CANCEL_DETECTION', payload: { requestId } }).catch(() => undefined);
        resolve({ requestId, status: 'failed', text: '', spans: [], boxes: [], meanConfidence: 0, ms: 0, message: 'canceled' });
      };
      const timer = window.setTimeout(() => {
        reject(new Error('timed out'));
      }, SCAN_TIMEOUT_MS);
      readAsDataUrl(file)
        .then((dataUrl) => chrome.runtime.sendMessage({ type: 'OCR_IMAGE', payload: { requestId, dataUrl } }))
        .then((response: OcrResultResponse | undefined) => {
          if (response?.type !== 'OCR_RESULT') throw new Error('No answer from the extension.');
          resolve(response.payload);
        })
        .catch(reject)
        .finally(() => window.clearTimeout(timer));
    });
  },
  ask: (input) => new ImageCheckDialog(settings?.theme ?? 'dark').show(input),
  onBusy(busy) {
    ocrIndicator?.stop();
    ocrIndicator = null;
    if (!busy) {
      cancelActiveOcr = null;
      return;
    }
    ocrIndicator = new ScanningIndicator(settings?.theme ?? 'dark', () => cancelActiveOcr?.(), t('si.reading'));
    ocrIndicator.start();
  },
});
attachmentInterceptor.start();

const interceptor = new PasteInterceptor(adapter, {
  onAnalyzing: () => {
    scanningIndicator?.stop();
    scanningIndicator = new ScanningIndicator(settings.theme, () => {
      interceptor.cancelActiveDetection();
    });
    scanningIndicator.start();
  },

  onNoPii: (text) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showIndicator(t('ind.nothingFound'), NO_PII_INDICATOR_MS);
    interceptor.pasteOriginal(text);
  },

  onPiiDetected: (text, spans, timings) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showReviewOverlay(text, spans, timings);
  },

  onError: (error) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showIndicator(t('ind.error', { msg: String(error) }), 3000);
  },

  onCanceled: (explicitUserCancel) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    if (!explicitUserCancel) {
      showIndicator(t('ind.canceled'), NO_PII_INDICATOR_MS);
    }
  },

  onPartialCoverage: reportPartialCoverage,

  onExplicitCancelDecision: async () => chooseAfterExplicitScanCancel(),

  onComposerLookup: reportComposerLookup,
}, {
  waitForReady: () => pasteInterceptorReady,
});

// Register synchronously at document_start so page scripts cannot win the
// capture-phase race while this content script restores local state.
interceptor.start();

// --- Submit interceptor ---
// Holds Enter / send-button / form submit until the local scan has run, so
// typed prompts are reviewed too (paste review alone misses them).

const submitInterceptor = new SubmitInterceptor(adapter, {
  onAnalyzing: () => {
    scanningIndicator?.stop();
    scanningIndicator = new ScanningIndicator(settings?.theme ?? 'dark', () => {
      submitInterceptor.cancelActiveDetection();
    });
    scanningIndicator.start();
  },

  onNoPii: () => {
    scanningIndicator?.stop();
    scanningIndicator = null;
  },

  onPiiDetected: (text, spans, timings) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showReviewOverlay(text, spans, timings, submitSink);
  },

  onError: (error) => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showIndicator(t('ind.error', { msg: String(error) }), 5000);
  },

  onCanceled: () => {
    scanningIndicator?.stop();
    scanningIndicator = null;
    showIndicator(t('ind.canceledNotSent'), NO_PII_INDICATOR_MS);
  },

  onPartialCoverage: reportPartialCoverage,

  onComposerMissing: () => {
    showIndicator(t('ind.held'), 5000);
  },
}, {
  waitForReady: () => pasteInterceptorReady,
});

submitInterceptor.start();

// --- Response observer with de-anonymization banners ---

const responseObserver = new ResponseObserver(adapter, {
  onResponseWithPlaceholders: (element) => {
    // Resolved against the scope in memory rather than a fresh storage read:
    // the banner holds the resolver and asks again, so there is nothing to
    // wait for here and nothing to go stale.
    if (attachBanner(element, true) && settings.debug) {
      console.log('[PG:content] De-anonymization banner attached to response');
    }
  },
  hasKnownSynthetic: (text) => {
    if (!settings.identityVaultEnabled) return false;
    for (const record of identityVault.records) {
      if (record.syntheticValue && text.includes(record.syntheticValue)) {
        return true;
      }
    }
    return false;
  },
});

// --- Clipboard interceptor (toast-based de-anonymization) ---

const clipboardInterceptor = new ClipboardInterceptor({
  resolve: async (text: string) => scope.resolve(text),
});

// --- Settings listener ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse): undefined => {
  if (message.type === 'GET_PAGE_PROTECTION_STATE') {
    // Answered synchronously: the popup asks the active tab when it opens,
    // and a page that has not been pasted into yet answers `null` rather than
    // claiming anything about a lookup that never happened.
    sendResponse({
      type: 'PAGE_PROTECTION_STATE',
      payload: { composerMatch },
    });
    return undefined;
  }

  if (message.type === 'SETTINGS_UPDATED') {
    const vaultToggled = settings?.identityVaultEnabled !== message.payload.identityVaultEnabled;
    settings = message.payload;
    interceptor.setEnabled(settings.enabled);
    submitInterceptor.setEnabled(settings.enabled);
    if (vaultToggled) void reloadVaultAndScope();
    clipboardInterceptor.setTheme(settings.theme);
    clipboardInterceptor.setEnabled(
      settings.enabled && settings.clipboardInterceptEnabled,
    );
    if (!settings.enabled || settings.nerProvider === 'off') {
      reportSupportedPageActivity(false, true);
    } else {
      reportVisibility();
    }

    if (settings.debug) {
      console.log('[PG:content] Settings updated');
    }
  }
  return undefined;
});

// --- Initialize ---

async function init(): Promise<void> {
  // Load settings and adaptive thresholds
  settings = await loadSettings();
  await initLanguage();
  interceptor.setEnabled(settings.enabled);
  submitInterceptor.setEnabled(settings.enabled);
  attachmentInterceptor.setEnabled(settings.enabled && settings.imageCheckEnabled);
  attachmentInterceptor.setOfficeEnabled(settings.officeCheckEnabled);

  if (!settings.enabled) {
    releasePasteInterceptor?.();
    releasePasteInterceptor = null;
    if (settings.debug) {
      console.log('[PG:content] Extension disabled, not activating');
    }
    return;
  }

  await waitForDocumentBody();
  await maybeShowCriticalLocalAiModal();

  pageStatusChip = new PageStatusChip(settings.theme);
  await refreshSystemStatusFromBackground();

  adaptiveThresholds = await computeAdaptiveThresholds(settings.minConfidence);

  // Restore identity vault (cross-session, cross-provider) before the
  // conversation record: the record's tokens resolve through it.
  if (settings.identityVaultEnabled) {
    identityVault = await loadIdentityVault();
  }

  await loadConversationScope();

  releasePasteInterceptor?.();
  releasePasteInterceptor = null;

  // React to vault edits made elsewhere (options page, other tabs).
  // Without this, a user editing the synthetic value of "John Doe" in the
  // options page would still see the old value applied to subsequent
  // pastes in this tab until reload.
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes['pg_identity_vault']) {
        const next = changes['pg_identity_vault'].newValue;
        if (next && Array.isArray(next.records)) {
          identityVault = next;
          rebuildScope();
          if (settings.debug) {
            console.log('[PG:content] Vault reloaded from storage event');
          }
        }
      }
      if (changes['pg_settings']) {
        const next = changes['pg_settings'].newValue as Settings | undefined;
        if (next) {
          const vaultToggled = settings?.identityVaultEnabled !== next.identityVaultEnabled;
          settings = next;
          interceptor.setEnabled(settings.enabled);
          submitInterceptor.setEnabled(settings.enabled);
          attachmentInterceptor.setEnabled(settings.enabled && settings.imageCheckEnabled);
  attachmentInterceptor.setOfficeEnabled(settings.officeCheckEnabled);
          if (vaultToggled) void reloadVaultAndScope();
          clipboardInterceptor.setTheme(settings.theme);
          clipboardInterceptor.setEnabled(
            settings.enabled && settings.clipboardInterceptEnabled,
          );
          pageStatusChip?.setTheme(settings.theme);
          if (!settings.enabled || settings.nerProvider === 'off') {
            reportSupportedPageActivity(false, true);
          } else {
            reportVisibility();
          }
          if (settings.debug) {
            console.log('[PG:content] Settings reloaded from storage event');
          }
        }
      }
      if (changes[SYSTEM_CHECK_STORAGE_KEY]) {
        // System-check storage updates carry the freshest tier, localAiState,
        // and modal pending/dismissed flags. Re-derive the chip without
        // sending another message to the background.
        const next = changes[SYSTEM_CHECK_STORAGE_KEY].newValue as SystemCompatibilityStatus | undefined;
        lastSystemStatus = next ?? null;
        refreshPageStatusChip();
      }
    });
  }

  // Start observation and clipboard restoration after the DOM is available.
  startSupportedPageActivityHeartbeat();
  watchConversationUrl();
  watchTranscript();
  responseObserver.start();
  clipboardInterceptor.setTheme(settings.theme);
  clipboardInterceptor.setEnabled(settings.clipboardInterceptEnabled);
  clipboardInterceptor.start();

  if (settings.debug) {
    console.log(`[PG:content] PromptSkjold active on ${adapter.name} (${window.location.hostname})`);
    console.log(`[PG:content] Adaptive thresholds:`, adaptiveThresholds);
    console.log(`[PG:content] Conversation scope size: ${scope.size}`);
    console.log(`[PG:content] Vault size: ${identityVault.records.length}`);
  }
}

void init().catch((error) => {
  // Do not leave an initial paste held if local state restoration fails.
  // Disabling the interceptor restores the user's original paste through the
  // guarded handoff rather than silently dropping it.
  interceptor.setEnabled(false);
  submitInterceptor.setEnabled(false);
  releasePasteInterceptor?.();
  releasePasteInterceptor = null;

  // Report unconditionally — NOT behind `settings.debug`. Reaching here means
  // paste review is off for the rest of this page's lifetime: there is no
  // retry, and neither recovery listener can help (`chrome.storage.onChanged`
  // is registered further down `init` and so was never reached, and a
  // `SETTINGS_UPDATED` message cannot arrive if the runtime context is what
  // failed). A privacy tool that has stopped reviewing pastes must say so
  // rather than let the user keep pasting while believing they are covered.
  console.error(
    '[PG:content] Initialization failed — paste review is OFF for this page. '
      + 'Reload the page to retry.',
    error,
  );

  void waitForDocumentBody().then(() => {
    showIndicator(
      t('ind.offForPage'),
      INIT_FAILURE_INDICATOR_MS,
    );
  });
});
