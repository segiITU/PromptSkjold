/**
 * Keyboard handling for in-page modal dialogs mounted in a shadow root:
 * moves focus in, keeps Tab inside, routes Esc to `onEscape`, and keeps those
 * keys away from the host page (a chat site's own Esc/Tab handlers must not
 * react to keys meant for our dialog). Returns a function that undoes it and
 * gives focus back to what had it before.
 */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogKeyOptions {
  shadow: ShadowRoot;
  dialog: HTMLElement;
  /** Element to focus first (defaults to the first focusable control). */
  initialFocus?: HTMLElement | null;
  onEscape: () => void;
}

export function trapDialogKeys({ shadow, dialog, initialFocus, onEscape }: DialogKeyOptions): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const items = (): HTMLElement[] =>
    [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

  (initialFocus ?? items()[0])?.focus({ preventScroll: true });

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const list = items();
    if (list.length === 0) {
      event.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = shadow.activeElement as HTMLElement | null;
    const inside = !!active && list.includes(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);

  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (previous?.isConnected) {
      try {
        previous.focus({ preventScroll: true });
      } catch {
        /* best effort */
      }
    }
  };
}
