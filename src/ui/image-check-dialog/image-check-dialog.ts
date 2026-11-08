import type { ThemeSetting } from '../../shared/message-types';
import { getLanguage, t, tn } from '../../shared/i18n/core';
import { ensurePageFonts } from '../shared/page-fonts';
import { trapDialogKeys } from '../shared/dialog-keys';
import { categoryOf, iconSvg } from '../../shared/design/categories';
import { SHADOW_DIALOG_STYLES } from '../shared/dialog-styles';
import type { MessageKey } from '../../shared/i18n/da';

export type ImageCheckDecision = 'attach' | 'redact' | 'drop' | 'text';

export interface ImageCheckBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ImageCheckItem {
  /** Entity type, e.g. CPR. */
  type: string;
  /** The text the OCR read for this item. */
  text: string;
  /** Where it sits in the image; empty when it could not be located. */
  boxes: ImageCheckBox[];
}

export interface ImageCheckDialogInput {
  fileName: string;
  /** Object URL of the image, for the preview. */
  imageUrl?: string;
  items: ImageCheckItem[];
  /** False for files that cannot be blacked out (PDFs). The redact choice is then hidden. */
  canRedact?: boolean;
  /** Things the user should know, such as pages that were not read. */
  notes?: string[];
  /** Set when the image could not be checked at all. */
  problem?: string;
  /** With a problem: the items that could not be located, shown by name so the user can see what would stay visible. */
  missed?: string[];
  /** With a problem: also offer an anonymised text copy built from the text that was read ('text'). */
  canTextCopy?: boolean;
}

const STYLES = SHADOW_DIALOG_STYLES;


function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function label(type: string): string {
  const key = `entity.${type}` as MessageKey;
  const text = t(key);
  return text === key ? type.toLowerCase().replace(/_/g, ' ') : text;
}

/**
 * Review step for an image the OCR pass flagged: the picture with the found
 * items outlined on the left, the list of items on the right, as in the text
 * review. Choices: attach a copy with those places blacked out, attach the
 * original, or leave it out. When items could not be located, an anonymised
 * text copy can be offered instead.
 */
export class ImageCheckDialog {
  private host: HTMLDivElement | null = null;

  constructor(private readonly theme: ThemeSetting = 'dark') {}

  show(input: ImageCheckDialogInput): Promise<ImageCheckDecision> {
    this.dispose();
    ensurePageFonts();
    const host = el('div');
    host.id = 'pg-image-check-dialog-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLES;
    const backdrop = el('div', 'backdrop');
    const dialog = el('section', 'dialog wide');
    dialog.dataset.theme = this.theme;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'pg-image-check-title');
    dialog.lang = getLanguage();

    const canRedact = input.canRedact !== false;
    const located = input.items.filter((item) => item.boxes.length > 0);
    const unlocated = canRedact ? input.items.length - located.length : 0;

    const heading = el('h2', undefined, input.problem ? (canRedact ? t('ic.titleProblemImage') : t('ic.titleProblemFile')) : canRedact ? t('ic.titleFoundImage') : t('ic.titleFoundFile'));
    heading.id = 'pg-image-check-title';
    dialog.append(heading);
    const lead = el('p');
    lead.append(
      el('span', 'file', input.fileName),
      input.problem ? ` — ${input.problem}` : ` ${t('ic.seems')}`,
    );
    dialog.append(lead);

    if (!input.problem) {
      const cols = el('div', 'cols');
      if (input.imageUrl) {
        const preview = el('div', 'preview');
        const img = el('img');
        img.alt = t('ic.alt');
        img.addEventListener('load', () => {
          for (const item of located) {
            for (const b of item.boxes) {
              const box = el('div', 'box');
              box.style.left = `${(b.x0 / img.naturalWidth) * 100}%`;
              box.style.top = `${(b.y0 / img.naturalHeight) * 100}%`;
              box.style.width = `${((b.x1 - b.x0) / img.naturalWidth) * 100}%`;
              box.style.height = `${((b.y1 - b.y0) / img.naturalHeight) * 100}%`;
              preview.append(box);
            }
          }
        });
        img.src = input.imageUrl;
        preview.append(img);
        cols.append(preview);
      }
      const list = el('ul', 'items');
      for (const item of input.items) {
        const li = el('li');
        const kind = el('span', 'type');
        const icon = el('span', 'ic');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = iconSvg(categoryOf(item.type));
        kind.append(icon, label(item.type));
        li.append(kind, el('span', 'value', item.text));
        if (canRedact && item.boxes.length === 0) li.append(el('span', 'unlocated', t('ic.unlocated')));
        list.append(li);
      }
      cols.append(list);
      dialog.append(cols);
      if (unlocated > 0) {
        dialog.append(
          el(
            'p',
            'note',
            tn('ic.unlocatedNote', unlocated),
          ),
        );
      }
    }

    if (input.problem && input.missed && input.missed.length > 0) {
      dialog.append(el('p', 'note', `${t('ic.missedList')} ${input.missed.join(' · ')}`));
    }
    for (const note of input.notes ?? []) dialog.append(el('p', 'note', note));
    const actions = el('div', 'actions');
    const drop = el('button', 'secondary', t('ic.drop'));
    const attach = el('button', 'secondary', t('ic.attach'));
    const redact = el('button', 'primary', t('ic.redact'));
    const textCopy = el('button', 'primary', t('ic.textCopy'));
    for (const b of [drop, attach, redact, textCopy]) b.type = 'button';
    redact.disabled = located.length === 0;
    actions.append(drop, attach);
    if (input.problem && input.canTextCopy) {
      dialog.append(el('p', 'note', t('ic.textCopyNote')));
      actions.append(textCopy);
    }
    if (!input.problem && canRedact) actions.append(redact);
    dialog.append(actions);
    // Esc is the safe choice (nothing is attached), so it is said out loud instead of happening silently.
    drop.title = 'Esc';
    dialog.append(el('p', 'note', t('ic.escHint')));
    backdrop.append(dialog);
    shadow.append(style, backdrop);
    document.body.appendChild(host);
    this.host = host;

    let releaseKeys: (() => void) | null = null;
    return new Promise((resolve) => {
      const finish = (decision: ImageCheckDecision): void => {
        releaseKeys?.();
        this.dispose();
        resolve(decision);
      };
      const release = trapDialogKeys({
        shadow,
        dialog,
        initialFocus: input.problem || !canRedact || redact.disabled ? drop : redact,
        onEscape: () => finish('drop'),
      });
      releaseKeys = release;
      drop.addEventListener('click', () => finish('drop'));
      attach.addEventListener('click', () => finish('attach'));
      redact.addEventListener('click', () => finish('redact'));
      textCopy.addEventListener('click', () => finish('text'));
    });
  }

  dispose(): void {
    this.host?.remove();
    this.host = null;
  }
}
