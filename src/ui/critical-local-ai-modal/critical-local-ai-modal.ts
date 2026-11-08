import type { ThemeSetting } from '../../shared/message-types';
import { getLanguage, t, tn } from '../../shared/i18n/core';
import { ensurePageFonts } from '../shared/page-fonts';
import { trapDialogKeys } from '../shared/dialog-keys';
import { SHADOW_DIALOG_STYLES } from '../shared/dialog-styles';

const MODAL_STYLES = SHADOW_DIALOG_STYLES;


export interface CriticalLocalAiModalCallbacks {
  onDismiss: () => Promise<void> | void;
  onOpenSettings: () => Promise<void> | void;
}

export class CriticalLocalAiModal {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private mounted = false;
  private dismissed = false;
  private releaseKeys: (() => void) | null = null;

  constructor(
    private readonly theme: ThemeSetting,
    private readonly callbacks: CriticalLocalAiModalCallbacks,
  ) {
    ensurePageFonts();
    this.host = document.createElement('div');
    this.host.id = 'pg-critical-local-ai-modal-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>${MODAL_STYLES}</style>
      <div class="pg-critical-modal-backdrop" role="presentation">
        <section class="pg-critical-modal" data-theme="${this.theme}" lang="${getLanguage()}" role="dialog" aria-modal="true" aria-labelledby="pg-critical-modal-title" aria-describedby="pg-critical-modal-body">
          <h2 class="pg-critical-modal-title" id="pg-critical-modal-title">${t('cm.title')}</h2>
          <p class="pg-critical-modal-body" id="pg-critical-modal-body">
            ${t('cm.body')}
          </p>
          <ul class="pg-critical-modal-list">
            <li>${t('cm.li1')}</li>
            <li>${t('cm.li2')}</li>
            <li>${t('cm.li3')}</li>
          </ul>
          <div class="pg-critical-modal-actions">
            <button class="pg-critical-modal-button pg-critical-modal-button-secondary" type="button" data-action="dismiss">${t('cm.keep')}</button>
            <button class="pg-critical-modal-button pg-critical-modal-button-primary" type="button" data-action="settings">${t('cm.settings')}</button>
          </div>
        </section>
      </div>
    `;
    this.shadow.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
      void this.dismiss();
    });
    this.shadow.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
      void this.openSettings();
    });
  }

  show(): void {
    if (this.mounted || this.dismissed) return;
    document.body.appendChild(this.host);
    this.mounted = true;
    const dialog = this.shadow.querySelector('.pg-critical-modal') as HTMLElement | null;
    if (dialog) {
      // Esc takes the safe, non-committal choice: keep pattern detection only.
      this.releaseKeys = trapDialogKeys({ shadow: this.shadow, dialog, onEscape: () => void this.dismiss() });
    }
  }

  isMounted(): boolean {
    return this.mounted;
  }

  async dismiss(): Promise<void> {
    if (this.dismissed) return;
    this.dismissed = true;
    await this.callbacks.onDismiss();
    this.dispose();
  }

  async openSettings(): Promise<void> {
    if (this.dismissed) return;
    await this.callbacks.onOpenSettings();
    await this.dismiss();
  }

  dispose(): void {
    if (!this.mounted) return;
    this.releaseKeys?.();
    this.releaseKeys = null;
    this.host.remove();
    this.mounted = false;
  }
}
