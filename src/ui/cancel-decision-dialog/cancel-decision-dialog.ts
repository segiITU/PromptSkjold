import type { ThemeSetting } from '../../shared/message-types';
import { getLanguage, t } from '../../shared/i18n/core';
import { ensurePageFonts } from '../shared/page-fonts';
import { SHADOW_DIALOG_STYLES } from '../shared/dialog-styles';

export type CancelDecision = 'paste-original' | 'drop';

export interface CancelDecisionDialogResult {
  decision: CancelDecision;
  remember: boolean;
  dismissed: boolean;
}

const STYLES = SHADOW_DIALOG_STYLES;


export class CancelDecisionDialog {
  private host: HTMLDivElement | null = null;
  private previousActive: Element | null = null;

  constructor(private readonly theme: ThemeSetting = 'dark') {}

  show(): Promise<CancelDecisionDialogResult> {
    this.dispose();
    ensurePageFonts();
    this.previousActive = document.activeElement;
    this.host = document.createElement('div');
    this.host.id = 'pg-cancel-decision-dialog-host';
    const shadow = this.host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="backdrop" part="backdrop">
        <section class="dialog" lang="${getLanguage()}" data-theme="${this.theme}" role="dialog" aria-modal="true" aria-labelledby="pg-cancel-title" aria-describedby="pg-cancel-body">
          <div class="header">
            <h2 id="pg-cancel-title">${t('cd.title')}</h2>
            <button class="close" type="button" aria-label="${t('cd.close')}">×</button>
          </div>
          <p id="pg-cancel-body">${t('cd.body')}</p>
          <label><input class="remember" type="checkbox"> <span>${t('cd.remember')}</span></label>
          <div class="actions">
            <button class="secondary" type="button">${t('cd.drop')}</button>
            <button class="primary" type="button">${t('cd.paste')}</button>
          </div>
        </section>
      </div>
    `;
    document.body.appendChild(this.host);

    const backdrop = shadow.querySelector('.backdrop') as HTMLElement;
    const dialog = shadow.querySelector('.dialog') as HTMLElement;
    const remember = shadow.querySelector('.remember') as HTMLInputElement;
    const primary = shadow.querySelector('.primary') as HTMLButtonElement;
    const secondary = shadow.querySelector('.secondary') as HTMLButtonElement;
    const close = shadow.querySelector('.close') as HTMLButtonElement;
    const focusables = [close, remember, secondary, primary];

    return new Promise((resolve) => {
      const finish = (result: CancelDecisionDialogResult): void => {
        document.removeEventListener('keydown', onKeyDown, true);
        this.dispose();
        resolve(result);
      };
      const action = (decision: CancelDecision): void => {
        finish({ decision, remember: remember.checked, dismissed: false });
      };
      const dismiss = (): void => finish({ decision: 'drop', remember: false, dismissed: true });
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          return;
        }
        if (event.key === 'Tab') {
          event.stopPropagation();
          const index = focusables.indexOf((shadow.activeElement || document.activeElement) as HTMLButtonElement | HTMLInputElement);
          const next = event.shiftKey
            ? (index <= 0 ? focusables.length - 1 : index - 1)
            : (index === focusables.length - 1 ? 0 : index + 1);
          event.preventDefault();
          focusables[next].focus();
        }
      };

      primary.addEventListener('click', () => action('paste-original'));
      secondary.addEventListener('click', () => action('drop'));
      close.addEventListener('click', dismiss);
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) dismiss();
      });
      dialog.addEventListener('click', (event) => event.stopPropagation());
      document.addEventListener('keydown', onKeyDown, true);
      primary.focus();
    });
  }

  dispose(): void {
    this.host?.remove();
    this.host = null;
    if (this.previousActive instanceof HTMLElement) {
      this.previousActive.focus({ preventScroll: true });
    }
  }
}
