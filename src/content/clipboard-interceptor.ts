/**
 * Privacy Guardrail — Clipboard Interceptor (isolated coordinator)
 *
 * Drives a singleton "Replace with originals" toast. Two trigger sources:
 *
 *   1. `WRITE_INTERCEPTED` postMessages forwarded by the main-world patch
 *      (covers code paths that call `navigator.clipboard.writeText`).
 *   2. Capture + bubble-phase `copy` DOM events on `document` — the path
 *      used by Ctrl+C / right-click → Copy and by copy implementations that
 *      stage text through `clipboardData.setData(...)`. Capture gives manual
 *      selection copies a reliable selection fallback; bubble sees text that
 *      page handlers staged during the event.
 *
 * On Replace, the isolated world writes originals directly to the clipboard.
 * Originals must never be sent through a page-visible message or event.
 *
 * State is intentionally minimal: the entity-map / vault snapshot is
 * provided by an injected resolver callback, keeping this module
 * decoupled from storage and easily testable.
 */

import { ClipboardToast } from '../ui/clipboard-toast/clipboard-toast';
import type { ResolveResult } from '../shared/placeholder-resolver';

const SOURCE = 'pg-clipboard-intercept';

interface WriteInterceptedMessage {
  source: typeof SOURCE;
  kind: 'WRITE_INTERCEPTED';
  text: string;
  requestId: string;
}

export type ResolveCallback = (
  text: string,
) => ResolveResult | Promise<ResolveResult>;

export interface ClipboardInterceptorOptions {
  /** Returns the unified resolver decision for the just-copied text.
   *  Implementations are expected to load the latest conversation
   *  entity map + identity vault, augment, and call `resolveText`. */
  resolve: ResolveCallback;
  /** Theme to render the toast in. Updated via {@link setTheme}. */
  theme?: 'dark' | 'light';
  /** Whether the feature is currently enabled. Updated via
   *  {@link setEnabled}. */
  enabled?: boolean;
}

/** Function that performs the actual clipboard replacement when the
 *  user clicks "Replace with originals". The path that performs the
 *  replacement depends on the trigger source. */
type ReplaceFn = (deAnonText: string) => void;

export class ClipboardInterceptor {
  private resolve: ResolveCallback;
  private theme: 'dark' | 'light';
  private enabled: boolean;
  private toast: ClipboardToast | null = null;
  /** Most recent "what we just saw copied" — used to suppress duplicate
   *  triggers when both the writeText patch and the `copy` DOM event
   *  fire for one logical user action. */
  private lastSeenText: string | null = null;
  private lastSeenAt = 0;
  private copyRevision = 0;
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private copyListener: ((event: ClipboardEvent) => void) | null = null;
  private started = false;

  constructor(opts: ClipboardInterceptorOptions) {
    this.resolve = opts.resolve;
    this.theme = opts.theme ?? 'dark';
    this.enabled = opts.enabled ?? true;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.messageListener = (event: MessageEvent) => this.onWindowMessage(event);
    window.addEventListener('message', this.messageListener);

    this.copyListener = (event: ClipboardEvent) => this.onCopy(event);
    // Capture phase covers manual selections early; bubble phase preserves
    // support for pages that populate clipboardData in their own handlers.
    document.addEventListener('copy', this.copyListener, true);
    document.addEventListener('copy', this.copyListener, false);
  }

  stop(): void {
    if (!this.started) return;
    if (this.messageListener)
      window.removeEventListener('message', this.messageListener);
    if (this.copyListener) {
      document.removeEventListener('copy', this.copyListener, true);
      document.removeEventListener('copy', this.copyListener, false);
    }
    this.messageListener = null;
    this.copyListener = null;
    this.started = false;
    this.copyRevision++;
    this.disposeToast();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.copyRevision++;
      this.disposeToast();
    }
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.theme = theme;
  }

  /** Trigger the toast pipeline for an arbitrary copied string. The
   *  `replace` callback is what actually performs the clipboard swap if
   *  the user clicks Replace. Public so tests can drive the coordinator
   *  without round-tripping through DOM events or postMessage. */
  async handleCopiedText(text: string, replace: ReplaceFn): Promise<void> {
    if (!this.enabled) return;
    if (!text) return;

    // Dedupe: if the same text was just observed within ~250 ms, skip.
    // Two trigger sources may fire for one user action (e.g. a button
    // that calls `writeText` AND dispatches a copy event); we only want
    // one toast per logical copy.
    const now = Date.now();
    if (this.lastSeenText === text && now - this.lastSeenAt < 250) return;
    this.lastSeenText = text;
    this.lastSeenAt = now;
    const revision = ++this.copyRevision;
    this.disposeToast();

    let result: ResolveResult;
    try {
      result = await this.resolve(text);
    } catch {
      return;
    }
    if (revision !== this.copyRevision || !this.enabled) return;
    this.disposeToast();
    if (!result || result.matches.length === 0) return;

    this.toast = new ClipboardToast(this.theme, {
      onReplace: () => {
        if (revision === this.copyRevision && this.enabled) replace(result.deAnonText);
      },
      onDispose: () => {
        this.toast = null;
      },
    });
    this.toast.show();
  }

  /** The page reports copied placeholders inward; originals never go outward. */
  handleIntercepted(text: string, _requestId: string): Promise<void> {
    return this.handleCopiedText(text, (text) => this.writeOriginals(text));
  }

  private writeOriginals(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  private onWindowMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const data = event.data as WriteInterceptedMessage | undefined;
    if (!data || data.source !== SOURCE) return;
    if (data.kind !== 'WRITE_INTERCEPTED') return;
    if (typeof data.text !== 'string' || typeof data.requestId !== 'string') return;
    // SOURCE is public, so any script on the page can send this message. A real copy follows a user
    // gesture; without one the page could pop a "restore originals" offer for text of its choosing.
    if (!navigator.userActivation?.isActive) return;
    void this.handleIntercepted(data.text, data.requestId);
  }

  private onCopy(event: ClipboardEvent): void {
    if (!this.enabled) return;
    // Prefer text already staged on the event. Fall back to the current
    // selection — needed for Ctrl+C / right-click copy paths where the
    // browser default action writes to the system clipboard after JS has
    // observed the event and does not expose that default text via
    // clipboardData.getData().
    let text = '';
    try {
      text = event.clipboardData?.getData('text/plain') ?? '';
    } catch {
      text = '';
    }
    if (!text) {
      const selection = window.getSelection?.();
      text = selection ? selection.toString() : '';
    }
    if (!text) return;

    void this.handleCopiedText(text, (deAnonText) => {
      // Different JS world from the page, so navigator.clipboard.writeText
      // here is the unmodified browser implementation — no recursion.
      navigator.clipboard?.writeText(deAnonText).catch(() => {
        // Swallow; the user has already moved past the toast.
      });
    });
  }

  private disposeToast(): void {
    if (this.toast) {
      this.toast.dispose();
      this.toast = null;
    }
  }
}
