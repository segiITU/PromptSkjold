import type { SiteAdapter } from './site-adapters/adapter-interface';
import { isTextFormControl } from './site-adapters/adapter-interface';
import type {
  CancelDetectionRequest,
  DetectPiiRequest,
  DetectionCanceledResponse,
  NerCoverage,
  PiiResultResponse,
  PiiSpan,
} from '../shared/message-types';
import { detectionOptionsFromSettings } from '../shared/detection-config';
import { loadSettings } from '../shared/storage';
import { sendRuntimeMessageBestEffort } from './runtime-messaging';
import { requirePiiResult } from '../shared/detection-result';

/** How long to wait for the site's send button to become clickable. */
const SEND_BUTTON_WAIT_MS = 1000;
/** After a scan failure, a second attempt inside this window is sent unscanned. */
const FAILED_SCAN_RETRY_WINDOW_MS = 15000;

export interface SubmitInterceptorCallbacks {
  onAnalyzing: () => void;
  /** Nothing found; the interceptor submits the original text itself. */
  onNoPii: (text: string) => void;
  onPiiDetected: (text: string, spans: PiiSpan[], timings?: { totalMs: number }) => void;
  onError: (error: string) => void;
  /** The model pass read only part of a very large text (pattern rules covered all of it). */
  onPartialCoverage?: (coverage: NerCoverage) => void;
  /** Scan canceled by the user. The message is NOT sent. */
  onCanceled: () => void;
  /** Submit held because no composer could be found to read. */
  onComposerMissing?: () => void;
}

export interface SubmitInterceptorOptions {
  waitForReady?: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);

/**
 * Read the composer's text so that span offsets returned by detection refer
 * to exactly the string that will later be replaced.
 *
 * Rich editors (ProseMirror) render one block element per line; `innerText`
 * would double the line breaks, so blocks are joined with a single newline.
 */
export function readComposerText(element: HTMLElement): string {
  if (isTextFormControl(element)) return element.value;
  const children = Array.from(element.children) as HTMLElement[];
  if (children.length > 0 && children.every((c) => BLOCK_TAGS.has(c.tagName))) {
    return children.map((c) => c.textContent ?? '').join('\n');
  }
  return element.textContent ?? '';
}

/** Select the whole composer so the next insert replaces its content. */
function selectAllInComposer(element: HTMLElement): void {
  element.focus();
  if (isTextFormControl(element)) {
    element.setSelectionRange(0, element.value.length);
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isVisiblyEnabled(button: HTMLElement): boolean {
  if ((button as HTMLButtonElement).disabled) return false;
  if (button.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Holds prompt submission (Enter key, send button, form submit) until the
 * local detection pipeline has reviewed the composer text.
 *
 * Interception happens in the capture phase on `window`, so the page's own
 * handlers never see the original event. Nothing is sent to the network by
 * this extension; when the text is cleared, the interceptor re-triggers the
 * site's own send action.
 */
export class SubmitInterceptor {
  private adapter: SiteAdapter;
  private callbacks: SubmitInterceptorCallbacks;
  private waitForReady: () => Promise<void>;
  private enabled = true;
  private busy = false;
  private lastFailedScanAt = 0;
  private failedSnapshot: { composer: HTMLElement; text: string; url: string } | null = null;
  private composerText = '';
  private composerUrl = '';
  private operationVersion = 0;
  private syntheticAction: { composer: HTMLElement; button?: HTMLElement } | null = null;
  private syntheticKeys = new WeakSet<Event>();
  private requestCounter = 0;
  private readonly requestNamespace = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  private activeRequestId: string | null = null;
  private canceledRequestIds = new Set<string>();
  private composer: HTMLElement | null = null;

  constructor(
    adapter: SiteAdapter,
    callbacks: SubmitInterceptorCallbacks,
    options: SubmitInterceptorOptions = {},
  ) {
    this.adapter = adapter;
    this.callbacks = callbacks;
    this.waitForReady = options.waitForReady ?? (() => Promise.resolve());
  }

  start(): void {
    window.addEventListener('keydown', this.handleKeydown, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('submit', this.handleSubmit, true);
  }

  stop(): void {
    window.removeEventListener('keydown', this.handleKeydown, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('submit', this.handleSubmit, true);
    this.finish();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  cancelActiveDetection(): void {
    if (!this.activeRequestId) return;
    const requestId = this.activeRequestId;
    this.canceledRequestIds.add(requestId);
    this.activeRequestId = null;
    const request: CancelDetectionRequest = {
      type: 'CANCEL_DETECTION',
      payload: { requestId },
    };
    sendRuntimeMessageBestEffort(request);
    this.finish();
    this.callbacks.onCanceled();
  }

  /** Review finished with the original text: send it unchanged. */
  submitOriginal(): void {
    if (!this.ensureSnapshot()) return;
    void this.triggerSend();
  }

  /** Review finished with replacements: swap the composer text, then send. */
  submitReplaced(text: string): void {
    const composer = this.composer;
    if (!this.ensureSnapshot() || !composer) return;
    selectAllInComposer(composer);
    this.adapter.insertText(composer, text);
    this.composerText = text;
    void this.triggerSend();
  }

  /** Review dismissed: leave the composer as is and do not send. */
  abandon(): void {
    this.finish();
  }

  /** Check an asynchronous review action before it mutates conversation state. */
  isCurrentReview(): boolean {
    return this.ensureSnapshot();
  }

  // --- event handlers ---

  private ensureSnapshot(): boolean {
    const composer = this.composer;
    if (composer?.isConnected && this.adapter.getInputElement() === composer
      && window.location.href === this.composerUrl && readComposerText(composer) === this.composerText) return true;
    this.finish();
    this.callbacks.onError('Message NOT sent: the message or conversation changed. Review it and press send again.');
    return false;
  }

  private composerFor(target: EventTarget | null): HTMLElement | null {
    const adapterInput = this.adapter.getInputElement();
    if (!adapterInput) return null;
    const node = target as Node | null;
    if (node && (adapterInput === node || adapterInput.contains(node))) return adapterInput;
    return null;
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.enabled || this.syntheticKeys.delete(event)) return;
    if (event.key !== 'Enter' || event.shiftKey || event.altKey) return;
    // IME composition: Enter confirms a candidate, it does not send.
    if (event.isComposing || event.keyCode === 229) return;

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const composer = this.composerFor(path[0] ?? event.target);
    if (!composer) return;

    this.intercept(event, composer);
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.enabled) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const first = (path[0] ?? event.target) as Element | null;
    if (!first || typeof first.closest !== 'function') return;
    const selectors = this.adapter.sendButtonSelectors;
    if (!selectors || selectors.length === 0) return;
    if (!first.closest(selectors.join(','))) return;
    if (!event.isTrusted && first.closest(selectors.join(',')) === this.syntheticAction?.button) return;

    const composer = this.adapter.getInputElement();
    if (!composer) {
      // A send control was activated but no composer can be read. Holding the
      // click is the safe choice: the text cannot be reviewed.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.callbacks.onComposerMissing?.();
      return;
    }
    this.intercept(event, composer);
  };

  private handleSubmit = (event: Event): void => {
    if (!this.enabled) return;
    const composer = this.adapter.getInputElement();
    const form = event.target as HTMLElement | null;
    if (!composer || !form || typeof form.contains !== 'function' || !form.contains(composer)) return;
    // A native submit caused synchronously by button.click() is trusted in Chromium.
    // The exemption belongs to this action's exact composer, not to an event trust flag or time window.
    if (this.syntheticAction?.composer === composer && readComposerText(composer) === this.composerText) return;
    this.intercept(event, composer);
  };

  private intercept(event: Event, composer: HTMLElement): void {
    const text = readComposerText(composer);
    // Nothing to review: let the site handle it (e.g. empty Enter).
    if (text.trim().length === 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (this.busy) return; // a review is already in flight
    this.busy = true;
    this.composer = composer;
    this.composerText = text;
    this.composerUrl = window.location.href;
    const version = ++this.operationVersion;
    void this.process(text, version);
  }

  // --- flow ---

  private async process(text: string, version: number): Promise<void> {
    try {
      await this.waitForReady();
    } catch (error) {
      if (version !== this.operationVersion) return;
      this.failScan(getErrorMessage(error));
      return;
    }

    if (version !== this.operationVersion) return;
    if (!this.ensureSnapshot()) return;
    if (!this.enabled) {
      this.submitOriginal();
      return;
    }

    this.callbacks.onAnalyzing();
    await this.analyze(text, version);
  }

  private async analyze(text: string, version: number): Promise<void> {
    const requestId = `pg_submit_${this.requestNamespace}_${++this.requestCounter}_${Date.now()}`;
    this.activeRequestId = requestId;

    try {
      const settings = await loadSettings();
      if (this.canceledRequestIds.delete(requestId) || version !== this.operationVersion) return;

      const request: DetectPiiRequest = {
        type: 'DETECT_PII',
        payload: { text, requestId, config: detectionOptionsFromSettings(settings) },
      };
      const response: PiiResultResponse | DetectionCanceledResponse =
        await chrome.runtime.sendMessage(request);

      if (this.canceledRequestIds.delete(requestId) || version !== this.operationVersion) return;
      this.activeRequestId = null;

      if (response?.type === 'DETECTION_CANCELED') {
        this.finish();
        this.callbacks.onCanceled();
        return;
      }
      const { spans, timings } = requirePiiResult(response).payload;
      if (!this.ensureSnapshot()) return;
      if (timings?.nerCoverage?.mode === 'partial') {
        this.callbacks.onPartialCoverage?.(timings.nerCoverage);
      }
      if (spans.length === 0) {
        if (timings?.nerCoverage?.mode === 'partial') {
          this.failScan('Only part of the message was checked by Local AI');
          return;
        }
        this.callbacks.onNoPii(text);
        this.submitOriginal();
      } else {
        this.callbacks.onPiiDetected(text, spans, timings);
      }
    } catch (err) {
      if (this.canceledRequestIds.delete(requestId) || version !== this.operationVersion) return;
      this.activeRequestId = null;
      this.failScan(getErrorMessage(err));
    }
  }

  /**
   * Fail closed: a scan that could not run does not silently let the message
   * through. The text stays in the composer; pressing send again within a
   * short window sends it unscanned, so the user is never stuck.
   */
  private failScan(message: string): void {
    const now = Date.now();
    if (!this.ensureSnapshot()) return;
    const retryAllowed = now - this.lastFailedScanAt < FAILED_SCAN_RETRY_WINDOW_MS
      && this.failedSnapshot?.composer === this.composer
      && this.failedSnapshot.text === this.composerText && this.failedSnapshot.url === this.composerUrl;
    if (retryAllowed) {
      this.lastFailedScanAt = 0;
      this.callbacks.onError(`${message} — sending unscanned`);
      void this.triggerSend();
      return;
    }
    this.lastFailedScanAt = now;
    this.failedSnapshot = { composer: this.composer!, text: this.composerText, url: this.composerUrl };
    this.finish(true);
    this.callbacks.onError(`${message} — message NOT sent. Press send again to send without scanning.`);
  }

  private finish(preserveFailedRetry = false): void {
    if (!preserveFailedRetry) {
      this.lastFailedScanAt = 0;
      this.failedSnapshot = null;
    }
    this.busy = false;
    this.activeRequestId = null;
    this.composer = null;
    this.composerText = '';
    this.composerUrl = '';
    this.operationVersion++;
  }

  // --- re-submit ---

  private findSendButton(): HTMLElement | null {
    for (const selector of this.adapter.sendButtonSelectors ?? []) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        if (isVisiblyEnabled(el)) return el;
      }
    }
    return null;
  }

  /** Re-trigger the site's own send action, allowing it past this interceptor. */
  private async triggerSend(): Promise<void> {
    const version = this.operationVersion;

    // Frameworks enable the send button after they observe the input event.
    const deadline = Date.now() + SEND_BUTTON_WAIT_MS;
    let button = this.findSendButton();
    while (!button && Date.now() < deadline) {
      await delay(50);
      if (version !== this.operationVersion) return;
      if (!this.ensureSnapshot()) return;
      button = this.findSendButton();
    }
    if (version !== this.operationVersion || !this.ensureSnapshot()) return;
    const composer = this.composer!;

    if (button) {
      this.syntheticAction = { composer, button };
      try {
        button.click();
      } finally {
        this.syntheticAction = null;
        this.finish();
      }
      return;
    }

    const init: KeyboardEventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const keydown = new KeyboardEvent('keydown', init);
    this.syntheticKeys.add(keydown);
    this.syntheticAction = { composer };
    try {
      composer.dispatchEvent(keydown);
      composer.dispatchEvent(new KeyboardEvent('keyup', init));
    } finally {
      this.syntheticAction = null;
      this.finish();
    }
  }
}
