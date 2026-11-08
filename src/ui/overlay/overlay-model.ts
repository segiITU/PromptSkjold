/**
 * Privacy Guardrail — Review Overlay state model
 *
 * Holds the reactive state for the Svelte review overlay using Svelte
 * stores (the established pattern in this codebase — see
 * src/popup/popup-model.svelte.ts). Wraps the OverlayCallbacks so
 * components only need to call model methods; the model emits feedback
 * entries identical to the previous vanilla-TS implementation.
 */

import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import type { EntityType, FeedbackEntry, PiiSpan } from '../../shared/message-types';
import { stringIndexToByteOffset } from '../../shared/text-offsets';
import { t } from '../../shared/i18n/core';
import type { MessageKey } from '../../shared/i18n/da';
import { buildOverlayView, type OverlayView } from './overlay-view';

export interface OverlayCallbacks {
  onConfirm: (approvedSpans: PiiSpan[]) => void;
  onPasteOriginal: () => void;
  onCancel: () => void;
  onFeedback: (entry: FeedbackEntry) => void;
  onAddToAllowlist: (text: string) => void;
  onEditDetails: (text: string) => void;
  /** The extra action from OverlayOptions was chosen. */
  onExtraAction?: (approvedSpans: PiiSpan[]) => void;
}

/**
 * Changes for reviews that are not a paste: button wording, an extra choice
 * next to "original", and notes shown under the text.
 */
export interface OverlayOptions {
  /** Shown above the text tabs, e.g. the name of the file under review. */
  title?: string;
  /** Review an image: the picture takes the place of the text, items are outlined on it. */
  image?: {
    url: string;
    /** Where an item sits on the picture, in the picture's own pixels. Empty when it could not be located. */
    boxesFor: (span: PiiSpan) => Array<{ x0: number; y0: number; x1: number; y1: number }>;
  };
  originalLabel?: string;
  confirmLabel?: string;
  /** An extra way out, next to the "original" button. Receives the enabled items. */
  extraAction?: { label: string; title?: string };
  notes?: string[];
}

export interface SpanState {
  span: PiiSpan;
  enabled: boolean;
  entityType: EntityType;
  manualOverride: boolean;
  whitelisted: boolean;
}

export interface DismissMenuState {
  index: number;
  spanText: string;
  anchorRect: { top: number; right: number; bottom: number; left: number };
}

export type ThresholdResolver = (span: PiiSpan) => number;

/**
 * Whether a score meets a threshold, compared as the whole percentages the
 * entity list shows. A score of 0.996 is shown as "100%", so it must still pass
 * a 100% slider; comparing the raw numbers would drop it.
 */
export function meetsThreshold(score: number, threshold: number): boolean {
  return Math.round(score * 100) >= Math.round(threshold * 100);
}

/**
 * Returns the replacement string the real anonymiser would emit for a
 * given span. Resolvers may hold per-pass state (e.g. dedup new identities
 * by normalised text), so a fresh resolver is built for every preview
 * rebuild via `PreviewResolverFactory`.
 */
export type PreviewResolver = (span: PiiSpan) => string;
export type PreviewResolverFactory = () => PreviewResolver;

export class OverlayModel {
  readonly originalText: string;
  readonly timings?: { totalMs: number };
  private readonly thresholdFn: ThresholdResolver | null;
  private readonly callbacks: OverlayCallbacks;
  private destroyed = false;

  spanStates: Writable<SpanState[]>;
  manualSpans: Writable<PiiSpan[]>;
  confidenceThreshold: Writable<number>;
  /** A short message shown for a moment, e.g. "Mark removed". */
  notice: Writable<string | null> = writable(null);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  selectedSnippet: Writable<string | null>;
  dismissMenu: Writable<DismissMenuState | null>;

  /** Findings that were just switched to "replace": get a one-off marker strike and stamp. */
  fresh: Writable<Set<number>>;
  private freshTimer: ReturnType<typeof setTimeout> | undefined;

  totalCount: Readable<number>;
  enabledCount: Readable<number>;
  /** Paragraph-by-paragraph HTML for "your text" and "what will be sent", plus per-finding replacement tokens. */
  view: Readable<OverlayView>;
  mainIndices: Readable<number[]>;
  codeBlockIndices: Readable<number[]>;

  private readonly previewResolverFactory: PreviewResolverFactory | null;
  readonly options: OverlayOptions;

  constructor(
    originalText: string,
    spans: PiiSpan[],
    callbacks: OverlayCallbacks,
    confidenceThreshold: number | ThresholdResolver,
    timings?: { totalMs: number },
    previewResolverFactory?: PreviewResolverFactory,
    options: OverlayOptions = {},
  ) {
    this.options = options;
    this.previewResolverFactory = previewResolverFactory ?? null;
    this.originalText = originalText;
    this.callbacks = callbacks;
    this.thresholdFn =
      typeof confidenceThreshold === 'function' ? confidenceThreshold : null;
    const initialThreshold = this.thresholdFn
      ? spans.length
        ? Math.min(...spans.map((s) => this.thresholdFn!(s)))
        : 0.5
      : (confidenceThreshold as number);

    this.spanStates = writable(
      spans.map((s) => ({
        span: s,
        enabled:
          !s.inCodeBlock &&
          meetsThreshold(s.score, this.thresholdFn ? this.thresholdFn(s) : initialThreshold),
        entityType: s.entity_type,
        manualOverride: false,
        whitelisted: false,
      })),
    );
    this.manualSpans = writable<PiiSpan[]>([]);
    this.confidenceThreshold = writable(initialThreshold);
    this.selectedSnippet = writable<string | null>(null);
    this.dismissMenu = writable<DismissMenuState | null>(null);
    this.timings = timings;

    this.totalCount = derived(
      [this.spanStates, this.manualSpans],
      ([states, manuals]) => states.length + manuals.length,
    );
    this.enabledCount = derived(
      [this.spanStates, this.manualSpans],
      ([states, manuals]) => states.filter((s) => s.enabled).length + manuals.length,
    );
    this.fresh = writable<Set<number>>(new Set());
    this.view = derived(
      [this.spanStates, this.manualSpans, this.fresh],
      ([states, manuals, fresh]) =>
        buildOverlayView({
          text: this.originalText,
          states,
          manuals,
          resolver: this.previewResolverFactory ? this.previewResolverFactory() : null,
          fresh,
          label: (type) => t(`entity.${type}` as MessageKey),
        }),
    );
    this.mainIndices = derived(this.spanStates, (states) => {
      const out: number[] = [];
      for (let i = 0; i < states.length; i++) if (!states[i].span.inCodeBlock) out.push(i);
      return out;
    });
    this.codeBlockIndices = derived(this.spanStates, (states) => {
      const out: number[] = [];
      for (let i = 0; i < states.length; i++) if (states[i].span.inCodeBlock) out.push(i);
      return out;
    });
  }

  /**
   * Effective threshold for a span. The slider acts as a "min confidence"
   * floor — when the adaptive resolver is configured we take the higher of
   * the adaptive value and the slider, so dragging the slider up always
   * tightens the gate (but never loosens it below the adaptive baseline).
   */
  thresholdFor(span: PiiSpan): number {
    const slider = get(this.confidenceThreshold);
    if (!this.thresholdFn) return slider;
    return Math.max(this.thresholdFn(span), slider);
  }

  isBelowThreshold(state: SpanState): boolean {
    return !meetsThreshold(state.span.score, this.thresholdFor(state.span));
  }

  /** Show a short message for a moment. */
  flash(message: string, ms = 1600): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(null), ms);
  }

  /** Switch an item by clicking it in the text or on the picture, and say what happened. */
  toggleWithNotice(index: number, enabled: boolean): void {
    this.toggle(index, enabled);
    this.flash(enabled ? t('ov.noticeOn') : t('ov.noticeOff'));
  }

  toggle(index: number, enabled: boolean): void {
    const before = get(this.spanStates)[index];
    this.spanStates.update((states) => {
      if (!states[index]) return states;
      const next = states.slice();
      next[index] = { ...next[index], enabled, manualOverride: true };
      return next;
    });
    if (enabled && before && !before.enabled) this.markFresh(index);
  }

  /** The strike-and-stamp animation plays once per user action, then the flag is cleared. */
  private markFresh(index: number): void {
    clearTimeout(this.freshTimer);
    this.fresh.set(new Set([index]));
    this.freshTimer = setTimeout(() => this.fresh.set(new Set()), 1200);
  }

  /** Switch one finding to "replace" (plays the strike-and-stamp once). */
  replaceIndex(index: number): void {
    this.toggle(index, true);
  }

  keepIndex(index: number): void {
    this.toggle(index, false);
  }

  /** "Always allow": the same as choosing "Always allow this value" in the old dismiss menu. */
  allowAlways(index: number): void {
    this.dismissMenu.set({ index, spanText: get(this.spanStates)[index]?.span.text ?? '', anchorRect: { top: 0, right: 0, bottom: 0, left: 0 } });
    this.confirmDismiss('value');
  }

  /** "Allow as a pattern": opens the options page so the user can craft one. */
  allowPattern(index: number): void {
    this.dismissMenu.set({ index, spanText: get(this.spanStates)[index]?.span.text ?? '', anchorRect: { top: 0, right: 0, bottom: 0, left: 0 } });
    this.confirmDismiss('pattern');
  }

  retype(index: number, newType: EntityType): void {
    this.spanStates.update((states) => {
      const state = states[index];
      if (!state || state.entityType === newType) return states;
      const next = states.slice();
      next[index] = { ...state, entityType: newType };
      this.callbacks.onFeedback({
        detectedType: state.entityType,
        correctedType: newType,
        timestamp: Date.now(),
      });
      return next;
    });
  }

  openDismissMenu(index: number, anchorRect: DismissMenuState['anchorRect']): void {
    const state = get(this.spanStates)[index];
    if (!state) return;
    this.dismissMenu.set({ index, spanText: state.span.text, anchorRect });
  }

  closeDismissMenu(): void {
    this.dismissMenu.set(null);
  }

  /**
   * Persistence choice from the dismiss menu:
   *  - 'none'     → just this time, no allowlist write
   *  - 'value'    → also add the exact value to the allowlist
   *  - 'pattern'  → also open options page so the user can craft a pattern
   */
  confirmDismiss(persist: 'none' | 'value' | 'pattern'): void {
    const menu = get(this.dismissMenu);
    if (!menu) return;
    const index = menu.index;
    const willWhitelist = persist !== 'none';
    let snapshot: SpanState | undefined;
    this.spanStates.update((states) => {
      snapshot = states[index];
      if (!snapshot) return states;
      const next = states.slice();
      next[index] = {
        ...snapshot,
        enabled: false,
        manualOverride: true,
        whitelisted: willWhitelist,
      };
      // "Always allow this value" covers every occurrence of that value, so
      // the other matches in this paste are released too.
      if (persist === 'value') {
        for (let i = 0; i < next.length; i++) {
          if (i !== index && next[i].span.text === snapshot.span.text) {
            next[i] = { ...next[i], enabled: false, manualOverride: true, whitelisted: true };
          }
        }
      }
      return next;
    });
    this.dismissMenu.set(null);
    if (!snapshot) return;
    const cap = snapshot;
    this.callbacks.onFeedback({
      detectedType: cap.span.entity_type,
      correctedType: 'NOT_PII',
      timestamp: Date.now(),
    });
    if (persist === 'value') this.callbacks.onAddToAllowlist(cap.span.text);
    if (persist === 'pattern') this.callbacks.onEditDetails(cap.span.text);
  }

  removeManual(index: number): void {
    this.manualSpans.update((spans) => spans.filter((_, i) => i !== index));
  }

  addManual(text: string, entityType: EntityType): boolean {
    const startIdx = this.originalText.indexOf(text);
    if (startIdx === -1) return false;
    const start = stringIndexToByteOffset(this.originalText, startIdx);
    const span: PiiSpan = {
      start,
      end: start + stringIndexToByteOffset(text, text.length),
      entity_type: entityType,
      score: 1.0,
      text,
      source: 'manual',
    };
    this.manualSpans.update((spans) => [...spans, span]);
    this.callbacks.onFeedback({
      detectedType: null,
      correctedType: entityType,
      timestamp: Date.now(),
    });
    this.selectedSnippet.set(null);
    return true;
  }

  setSelectedSnippet(text: string | null): void {
    this.selectedSnippet.set(text);
  }

  setThreshold(value: number): void {
    this.confidenceThreshold.set(value);
    this.spanStates.update((states) =>
      states.map((s) =>
        s.manualOverride
          ? s
          : {
              ...s,
              enabled:
                !s.span.inCodeBlock && meetsThreshold(s.span.score, this.thresholdFor(s.span)),
            },
      ),
    );
  }

  confirm(): PiiSpan[] {
    if (this.destroyed) return [];
    this.destroyed = true;
    const states = get(this.spanStates);
    const manuals = get(this.manualSpans);
    const approved = states
      .filter((s) => s.enabled)
      .map((s) => ({ ...s.span, entity_type: s.entityType }));
    const all = [...approved, ...manuals];
    this.callbacks.onConfirm(all);
    return all;
  }

  /** The extra action chosen: hand over the enabled items, like confirm but with its own callback. */
  extraAction(): PiiSpan[] {
    if (this.destroyed) return [];
    this.destroyed = true;
    const approved = [
      ...get(this.spanStates)
        .filter((s) => s.enabled)
        .map((s) => ({ ...s.span, entity_type: s.entityType })),
      ...get(this.manualSpans),
    ];
    this.callbacks.onExtraAction?.(approved);
    return approved;
  }

  pasteOriginal(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.callbacks.onPasteOriginal();
  }

  cancel(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.callbacks.onCancel();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

export function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 2) + '..' : text;
}
