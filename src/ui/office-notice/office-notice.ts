/**
 * PromptSkjold — notice for Excel and PowerPoint files that were NOT checked (Shadow DOM).
 *
 * Shown when the user attaches an .xlsx or .pptx file while "Tjek Excel- og PowerPoint-filer" is off. The file is
 * let through as before; this only says so, and offers to turn the setting on. "Slå til" writes the same setting
 * the popup and options switch use, so they reflect it. The file that was just attached is not re-checked (that
 * would need a re-scan and a second review of a file already handed to the page): the confirmation says the
 * setting applies the next time a file is attached.
 */
import { fileKind } from '../../files/kinds';
import { getLanguage, t } from '../../shared/i18n/core';
import { saveSettings } from '../../shared/storage';
import { ensurePageFonts } from '../shared/page-fonts';
import { SHADOW_DESIGN_SYSTEM_STYLES } from '../shared/shadow-design-system';

const NOTICE_VISIBLE_MS = 12_000;
const CONFIRMATION_VISIBLE_MS = 6_000;

/** True when at least one of the files is of a type the extension cannot read at all (.doc, .zip, .rtf, ...). */
export function unreadableFilesPresent(files: readonly { name: string; type: string }[]): boolean {
  return files.some((file) => fileKind(file) === null);
}

/** True when at least one of the files is an Excel or PowerPoint file that is being skipped because the switch is off. */
export function officeFilesSkipped(files: readonly { name: string; type: string }[], officeEnabled: boolean): boolean {
  if (officeEnabled) return false;
  return files.some((file) => {
    const kind = fileKind(file);
    return kind === 'xlsx' || kind === 'pptx';
  });
}

const STYLES = `
  ${SHADOW_DESIGN_SYSTEM_STYLES}

  .pg-office-notice {
    position: fixed;
    bottom: 132px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483646;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    width: max-content;
    max-width: min(520px, calc(100vw - 32px));
    padding: 10px 10px 10px 14px;
    border-radius: var(--pg-radius-md);
    font-size: 13px;
    line-height: 1.4;
    pointer-events: auto;
    animation: pg-design-pop-in 160ms ease-out;
  }
  .pg-office-msg { flex: 1; min-width: 0; }
  .pg-office-btn { padding: 6px 12px; white-space: nowrap; }
  .pg-office-close {
    appearance: none; border: 0; background: transparent; color: inherit; cursor: pointer;
    font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 999px; opacity: 0.75;
  }
  .pg-office-close:hover { opacity: 1; background: rgb(243 242 239 / 14%); }
  .pg-office-close:focus-visible { outline: 2.5px solid var(--pg-color-focus); outline-offset: 2px; }
  [hidden] { display: none !important; }
  @media (max-width: 520px) {
    .pg-office-notice { width: calc(100vw - 32px); flex-wrap: wrap; }
  }
`;

export interface OfficeNoticeOptions {
  /** 'unreadable': the file type is not supported at all, so there is nothing to turn on. Default: 'office'. */
  variant?: 'office' | 'unreadable';
  /** Called after the setting was written, so the running interceptor can follow it at once. */
  onEnabled?: () => void;
  /** Override how the setting is written (tests). Default: the shared settings storage. */
  enable?: () => Promise<void>;
  theme?: 'dark' | 'light';
}

let current: OfficeNotice | null = null;

/** Show the notice (one at a time). Returns the instance. */
export function showOfficeNotice(options: OfficeNoticeOptions = {}): OfficeNotice {
  current?.dispose();
  current = new OfficeNotice(options);
  current.show();
  return current;
}

export class OfficeNotice {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private msgEl: HTMLElement | null = null;
  private actionEl: HTMLButtonElement | null = null;
  private timer: number | null = null;
  private mounted = false;
  private disposed = false;

  constructor(private readonly options: OfficeNoticeOptions) {
    ensurePageFonts();
    this.host = document.createElement('div');
    this.host.id = 'pg-office-notice-host';
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="pg-office-notice pg-design-surface" data-theme="${options.theme ?? 'dark'}" lang="${getLanguage()}" role="status" aria-live="polite" aria-atomic="true">
        <span class="pg-office-msg">${t(options.variant === 'unreadable' ? 'file.notChecked' : 'office.notice')}</span>
        <button class="pg-office-btn pg-design-button" id="pg-office-enable-btn" type="button" data-action="enable"${options.variant === 'unreadable' ? ' hidden' : ''}>${t('office.turnOn')}</button>
        <button class="pg-office-close" type="button" aria-label="${t('common.close')}" data-action="close">×</button>
      </div>
    `;
    const root = this.shadow.querySelector('.pg-office-notice') as HTMLElement;
    this.msgEl = this.shadow.querySelector('.pg-office-msg');
    this.actionEl = this.shadow.querySelector('[data-action="enable"]');
    this.actionEl?.addEventListener('click', () => void this.enable());
    this.shadow.querySelector('[data-action="close"]')?.addEventListener('click', () => this.dispose());
    root.addEventListener('mouseenter', () => this.pause());
    root.addEventListener('mouseleave', () => this.schedule(NOTICE_VISIBLE_MS));
    root.addEventListener('focusin', () => this.pause());
    root.addEventListener('focusout', () => this.schedule(NOTICE_VISIBLE_MS));
  }

  show(): void {
    if (this.mounted || this.disposed) return;
    document.body.appendChild(this.host);
    this.mounted = true;
    this.schedule(NOTICE_VISIBLE_MS);
  }

  isMounted(): boolean {
    return this.mounted;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    if (this.mounted) this.host.remove();
    this.mounted = false;
    if (current === this) current = null;
  }

  private async enable(): Promise<void> {
    if (this.disposed) return;
    this.pause();
    try {
      await (this.options.enable ?? (() => saveSettings({ officeCheckEnabled: true })))();
    } catch {
      return; // leave the notice as it is; nothing was changed
    }
    this.options.onEnabled?.();
    if (this.msgEl) this.msgEl.textContent = t('office.enabled');
    if (this.actionEl) this.actionEl.hidden = true;
    this.schedule(CONFIRMATION_VISIBLE_MS);
  }

  private schedule(ms: number): void {
    if (this.disposed) return;
    this.pause();
    this.timer = window.setTimeout(() => this.dispose(), ms);
  }

  private pause(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
