/**
 * PromptSkjold — Page Status Chip (Shadow DOM)
 *
 * Persistent page-level chip surfacing degraded-protection states on
 * supported chat pages. Renders one reason at a time and supports
 * per-session minimization without permanent dismissal.
 */

import type { ThemeSetting } from '../../shared/message-types';
import { SHADOW_DESIGN_TOKENS } from '../shared/design-tokens.generated';
import { getLanguage, t } from '../../shared/i18n/core';
import { ensurePageFonts } from '../shared/page-fonts';
import { chipReasonMessage, type ChipMessage, type ChipReason } from '../../shared/page-status-chip-reason';

const CHIP_STYLES = `
  ${SHADOW_DESIGN_TOKENS}
  :host { all: initial; }

  .pg-chip {
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 2147483645;
    max-width: min(340px, calc(100vw - 32px));
    box-sizing: border-box;
    background: var(--sheet);
    color: var(--ink);
    border: 1.5px solid var(--ink);
    border-left-width: 5px;
    border-radius: var(--r-md);
    box-shadow: var(--shadow-float);
    font-family: var(--f-ui);
    font-size: 13px;
    line-height: 1.45;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: auto;
  }

  .pg-chip[data-reason="model-failed"],
  .pg-chip[data-reason="low-memory-protection"],
  .pg-chip[data-reason="composer-not-found"] { border-left-color: var(--c-cpr); }
  .pg-chip[data-reason="pattern-only"],
  .pg-chip[data-reason="running-on-cpu"],
  .pg-chip[data-reason="low-memory-warning"],
  .pg-chip[data-reason="unknown-memory"],
  .pg-chip[data-reason="enabled-despite-low-memory"] { border-left-color: var(--amber); }

  .pg-chip-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pg-chip-title {
    font-weight: 600;
    flex: 1;
  }

  .pg-chip-toggle {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--ink-3);
    cursor: pointer;
    font: inherit;
    font-size: 16px;
    line-height: 1;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .pg-chip-toggle:hover { background: rgb(27 27 26 / 9%); color: var(--ink); }

  .pg-chip-toggle:focus-visible {
    outline: 2.5px solid var(--ink);
    outline-offset: 2px;
  }

  .pg-chip-detail {
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .pg-chip[data-minimized="true"] {
    padding: 6px 10px;
    cursor: pointer;
  }

  .pg-chip[data-minimized="true"] .pg-chip-detail {
    display: none;
  }
`;


const SESSION_STORAGE_KEY = 'pg_page_status_chip_minimized';

export interface PageStatusChipCallbacks {
  onMinimizeChange?: (minimized: boolean) => void;
}

export class PageStatusChip {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private mounted = false;
  private currentReason: ChipReason | null = null;
  private currentMessage: ChipMessage | null = null;
  private minimized: boolean;
  private theme: ThemeSetting;
  private readonly callbacks: PageStatusChipCallbacks;

  constructor(theme: ThemeSetting = 'dark', callbacks: PageStatusChipCallbacks = {}) {
    this.theme = theme;
    this.callbacks = callbacks;
    this.minimized = readSessionMinimized();
    ensurePageFonts();
    this.host = document.createElement('div');
    this.host.id = 'pg-page-status-chip-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
  }

  setTheme(theme: ThemeSetting): void {
    this.theme = theme;
    if (this.mounted) this.render();
  }

  /** Update the displayed reason; pass null to remove the chip. */
  update(reason: ChipReason | null, message?: ChipMessage): void {
    if (
      reason === this.currentReason
      && (reason === null) === !this.mounted
      && sameMessage(message ?? null, this.currentMessage)
    ) return;
    this.currentReason = reason;
    this.currentMessage = message ?? null;

    if (reason === null) {
      this.dispose();
      return;
    }

    if (!this.mounted) {
      document.body.appendChild(this.host);
      this.mounted = true;
    }
    this.render();
  }

  setMinimized(minimized: boolean): void {
    if (this.minimized === minimized) return;
    this.minimized = minimized;
    writeSessionMinimized(minimized);
    if (this.mounted) this.render();
    this.callbacks.onMinimizeChange?.(minimized);
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  isMounted(): boolean {
    return this.mounted;
  }

  getReason(): ChipReason | null {
    return this.currentReason;
  }

  dispose(): void {
    if (!this.mounted) return;
    this.host.remove();
    this.mounted = false;
  }

  private render(): void {
    if (!this.currentReason) return;
    const { title, detail, technical } = this.currentMessage ?? chipReasonMessage(this.currentReason);
    const minimizedAttr = this.minimized ? 'true' : 'false';
    const toggleLabel = this.minimized ? t('chip.expand') : t('chip.minimize');
    const toggleGlyph = this.minimized ? '+' : '−';
    this.shadow.innerHTML = `
      <style>${CHIP_STYLES}</style>
      <div class="pg-chip" lang="${getLanguage()}" data-theme="${this.theme}" data-minimized="${minimizedAttr}" data-reason="${this.currentReason}" role="status" aria-live="polite">
        <div class="pg-chip-header">
          <span class="pg-chip-title">${escapeHtml(title)}</span>
          <button class="pg-chip-toggle" type="button" aria-label="${toggleLabel}" data-action="toggle">${toggleGlyph}</button>
        </div>
        <div class="pg-chip-detail"${technical ? ` title="${escapeHtml(technical)}"` : ''}>${escapeHtml(detail)}</div>
      </div>
    `;
    const toggleButton = this.shadow.querySelector('[data-action="toggle"]');
    toggleButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setMinimized(!this.minimized);
    });
    if (this.minimized) {
      const root = this.shadow.querySelector('.pg-chip');
      root?.addEventListener('click', () => this.setMinimized(false));
    }
  }
}

function sameMessage(a: ChipMessage | null, b: ChipMessage | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.title === b.title && a.detail === b.detail;
}

function readSessionMinimized(): boolean {
  try {
    return window.sessionStorage?.getItem(SESSION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionMinimized(minimized: boolean): void {
  try {
    if (minimized) {
      window.sessionStorage?.setItem(SESSION_STORAGE_KEY, '1');
    } else {
      window.sessionStorage?.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // sessionStorage may be blocked (e.g. third-party context). The chip
    // simply forgets the preference on the next page load — acceptable per
    // the per-session minimize semantics.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
