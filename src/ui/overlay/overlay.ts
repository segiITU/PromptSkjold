/**
 * PromptSkjold — Review Overlay (Svelte 5 + Shadow DOM)
 *
 * Thin imperative wrapper around the Svelte ReviewOverlay component.
 * Owns the host element, the closed shadow root, the global keyboard
 * shortcuts (Esc / Enter), and the lifecycle of the mounted Svelte
 * component. The Svelte component reads from an OverlayModel instance
 * which holds reactive state and forwards user actions to the
 * OverlayCallbacks supplied by the content script.
 */

import { mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { ENTITY_TYPES, type PiiSpan } from '../../shared/message-types';
import { initLanguage } from '../../shared/i18n/core';
import { ensurePageFonts } from '../shared/page-fonts';
import overlayCss from './overlay-styles.css';
import ReviewOverlayComponent from './ReviewOverlay.svelte';
import {
  OverlayModel,
  type OverlayCallbacks,
  type PreviewResolver,
  type OverlayOptions,
  type PreviewResolverFactory,
} from './overlay-model';

export const OVERLAY_ENTITY_TYPES = ENTITY_TYPES;
export type { OverlayCallbacks, OverlayOptions, PreviewResolver, PreviewResolverFactory };

/**
 * Shadow DOM overlay for reviewing and correcting PII detections.
 *
 * The constructor signature is preserved from the previous vanilla-TS
 * implementation so the call site in content-script.ts requires no
 * change. The `theme` parameter is kept for backwards compatibility but
 * is currently ignored — the popup and options page render in a single
 * light style and the overlay matches that unconditionally.
 */
export class ReviewOverlay {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private model: OverlayModel;
  private callbacks: OverlayCallbacks;
  // The Svelte 5 mount() return value is opaque; we type it as unknown
  // and pass it back to unmount() during destroy().
  private app: ReturnType<typeof mount> | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private previousFocus: HTMLElement | null = null;
  private inerted: Element[] = [];

  constructor(
    originalText: string,
    spans: PiiSpan[],
    callbacks: OverlayCallbacks,
    confidenceThreshold: number | ((span: PiiSpan) => number),
    timings?: { totalMs: number },
    _theme: 'dark' | 'light' = 'dark',
    previewResolverFactory?: PreviewResolverFactory,
    options?: OverlayOptions,
  ) {
    void _theme; // intentionally unused — single-style overlay.

    // Wrap the supplied callbacks so navigation actions (confirm /
    // pasteOriginal / cancel) automatically tear down the overlay,
    // matching the previous behaviour where each handler called
    // destroy() itself.
    this.callbacks = {
      ...callbacks,
      onConfirm: (approved) => {
        this.destroy();
        callbacks.onConfirm(approved);
      },
      onPasteOriginal: () => {
        this.destroy();
        callbacks.onPasteOriginal();
      },
      onCancel: () => {
        this.destroy();
        callbacks.onCancel();
      },
      onExtraAction: (approved) => {
        this.destroy();
        callbacks.onExtraAction?.(approved);
      },
    };

    this.model = new OverlayModel(
      originalText,
      spans,
      this.callbacks,
      confidenceThreshold,
      timings,
      previewResolverFactory,
      options,
    );

    // Keep the page's focus so it can be given back when the overlay closes.
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ensurePageFonts();
    void initLanguage();

    this.host = document.createElement('div');
    this.host.id = 'pg-review-overlay-host';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = overlayCss as unknown as string;
    this.shadow.appendChild(style);

    this.app = mount(ReviewOverlayComponent, {
      target: this.shadow as unknown as Element,
      props: { model: this.model, shadowRoot: this.shadow },
    });

    this.attachKeyboardShortcuts();
  }

  /** Show the overlay in the DOM. */
  show(): void {
    document.body.appendChild(this.host);
    // The review is modal: make the page behind it inert (not focusable, not clickable, hidden from assistive
    // tech). Only what was not inert already is touched, and destroy() undoes exactly that, always, before any
    // callback runs (the wrappers above destroy first), so the page is never left inert.
    this.inerted = [...document.body.children].filter((el) => el !== this.host && !(el as HTMLElement).inert);
    for (const el of this.inerted) (el as HTMLElement).inert = true;
  }

  /** Remove the overlay from the DOM. Idempotent. */
  destroy(): void {
    for (const el of this.inerted) (el as HTMLElement).inert = false;
    this.inerted = [];
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    if (this.app) {
      try {
        unmount(this.app);
      } catch {
        // Already unmounted — ignore.
      }
      this.app = null;
    }
    if (this.host.isConnected) {
      this.host.remove();
    }
    const back = this.previousFocus;
    this.previousFocus = null;
    if (back?.isConnected) {
      try {
        back.focus({ preventScroll: true });
      } catch {
        /* best effort */
      }
    }
  }

  private attachKeyboardShortcuts(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (this.model.isDestroyed()) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.model.confirm();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Esc closes the mark dialog first; only a second Esc cancels the review.
        if (get(this.model.selectedSnippet)) {
          this.model.setSelectedSnippet(null);
          return;
        }
        this.model.cancel();
      }
    };
    document.addEventListener('keydown', this.keyboardHandler);
  }
}
