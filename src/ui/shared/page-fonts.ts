/**
 * Registers the PromptSkjold fonts in the host page so Shadow DOM surfaces can
 * use them. @font-face inside a shadow root is ignored by Chrome, and exposing
 * font files as web_accessible_resources would make the extension detectable
 * by the chat sites, so the bytes are embedded (page-assets.generated.ts; IBM Plex Sans/Serif, SIL OFL 1.1,
 * see THIRD_PARTY_NOTICES.md and src/assets/fonts/LICENSE-*) and
 * added through the FontFace API. Failure is harmless: the CSS falls back to
 * Georgia / system-ui.
 */
import { PAGE_FONTS } from './page-assets.generated';

let started = false;

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function ensurePageFonts(): void {
  if (started || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  started = true;
  for (const f of PAGE_FONTS) {
    try {
      const face = new FontFace(f.family, decode(f.data), { weight: f.weight, display: 'swap' });
      document.fonts.add(face);
      void face.load().catch(() => undefined);
    } catch {
      /* fall back to system fonts */
    }
  }
}
