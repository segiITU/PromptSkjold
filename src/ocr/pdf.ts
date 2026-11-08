import type { GrayImage } from './types';

/** A page with fewer text-layer characters than this is treated as a scan. */
export const MIN_TEXT_LAYER_CHARS = 20;
/** Most pages of one PDF that are read at all; reading a text layer is cheap, so this is generous. */
export const MAX_PDF_PAGES = 500;
/** Scanned pages are read with OCR (about 2 s each), so only this many per PDF. */
export const MAX_OCR_PAGES = 20;
/** A blacked-out copy draws every page, so it is only offered up to this many pages. */
export const MAX_BLACKOUT_PAGES = 20;

export interface PdfPageSource {
  /** Text of the page's text layer (empty for a scanned page). */
  getText(): Promise<string>;
  /** Text typed into form fields and written in comments, which is not in the text layer. */
  getAnnotationText?(): Promise<string>;
  /** The page drawn as a grey image at a resolution suited to OCR. */
  renderGray(): Promise<GrayImage>;
}

export interface PdfDocumentSource {
  numPages: number;
  page(number: number): Promise<PdfPageSource>;
  destroy(): Promise<void> | void;
}

export type PdfPageKind = 'text' | 'ocr' | 'not-read';

export interface PdfExtraction {
  /** All page text, pages separated by a blank line. */
  text: string;
  pages: Array<{ page: number; kind: PdfPageKind }>;
  /** True when the document has more pages than were read. */
  truncated: boolean;
  /** Scanned pages that were not read. */
  unreadScans: number;
  /** Why scanned pages were left unread, when some were. */
  unreadReason: 'no-ocr' | 'limit' | null;
  /** Number of pages in the document. */
  pageCount: number;
}

/**
 * The text a person put into a page's annotations: comment and note text, who wrote it, and the values of
 * text and choice form fields. Check boxes and buttons only hold a state, links only an address. Each text once.
 */
export function annotationsToText(annotations: readonly unknown[]): string {
  const seen = new Set<string>();
  // pdf.js hands comment text and author over as `{ str, dir }`; a plain string is accepted too.
  const add = (value: unknown) => {
    const text = typeof value === 'object' && value !== null ? (value as { str?: unknown }).str : value;
    if (typeof text === 'string' && text.trim() !== '') seen.add(text.trim());
  };
  for (const item of annotations) {
    if (!item || typeof item !== 'object') continue;
    const annotation = item as Record<string, unknown>;
    add(annotation.contentsObj ?? annotation.contents);
    add(annotation.titleObj ?? annotation.title);
    if (annotation.fieldType === 'Btn') continue;
    for (const value of Array.isArray(annotation.fieldValue) ? annotation.fieldValue : [annotation.fieldValue]) add(value);
  }
  return [...seen].join('\n');
}

/**
 * Collect the text of a PDF. Pages with a text layer need no OCR; pages
 * without one are drawn and sent to `ocr` when it is available.
 */
export async function extractPdfText(
  doc: PdfDocumentSource,
  ocr: ((image: GrayImage) => Promise<string>) | null,
  signal?: AbortSignal,
): Promise<PdfExtraction> {
  const count = Math.min(doc.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  const pages: PdfExtraction['pages'] = [];
  let unreadScans = 0;
  let ocrPages = 0;
  let unreadReason: PdfExtraction['unreadReason'] = null;

  for (let n = 1; n <= count; n++) {
    if (signal?.aborted) throw new DOMException('PDF check canceled', 'AbortError');
    const page = await doc.page(n);
    const layer = (await page.getText()).trim();
    // Form fields and comments are not in the text layer; they go with the page's text whichever way it is read.
    const annotations = ((await page.getAnnotationText?.()) ?? '').trim();
    if (layer.length >= MIN_TEXT_LAYER_CHARS) {
      parts.push([layer, annotations].filter(Boolean).join('\n'));
      pages.push({ page: n, kind: 'text' });
      continue;
    }
    if (!ocr || ocrPages >= MAX_OCR_PAGES) {
      // Keep whatever little text the page had; it may still hold something.
      const kept = [layer, annotations].filter(Boolean).join('\n');
      if (kept) parts.push(kept);
      pages.push({ page: n, kind: 'not-read' });
      unreadScans += 1;
      unreadReason ??= ocr ? 'limit' : 'no-ocr';
      continue;
    }
    ocrPages += 1;
    const scanned = (await ocr(await page.renderGray())).trim();
    // A scan may still carry a few characters of text layer; keep both.
    parts.push([layer, scanned, annotations].filter(Boolean).join('\n'));
    pages.push({ page: n, kind: 'ocr' });
  }

  return {
    text: parts.filter(Boolean).join('\n\n'),
    pages,
    truncated: doc.numPages > count,
    unreadScans,
    unreadReason,
    pageCount: doc.numPages,
  };
}
