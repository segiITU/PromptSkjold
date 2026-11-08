import * as pdfjs from 'pdfjs-dist';
import { locateEverywhere } from '../ocr/locate';
import { MAX_BLACKOUT_PAGES, MIN_TEXT_LAYER_CHARS } from '../ocr/pdf';
import { buildPdfFromJpegs, type JpegPage } from '../ocr/pdf-writer';
import { rgbaToGray } from '../ocr/preprocess';
import type { GrayImage, OcrWord } from '../ocr/types';
import { withTimeout } from './pdf-loader';
import { textLayerWords } from './pdf-text-boxes';

/** Pages are drawn at this resolution for the blacked-out copy (a balance of size and legibility). */
const REDACT_DPI = 150;
const MAX_SIDE = 3500;
const JPEG_QUALITY = 0.8;
const PAGE_TIMEOUT_MS = 30_000;

export interface RedactedPdf {
  pdf: Uint8Array;
  pages: number;
  /** Items that were not found on any page and therefore stay visible. */
  missed: string[];
}

/**
 * Build a copy of a PDF in which every occurrence of the given items is
 * painted over. Pages are drawn one at a time (so memory stays at one page),
 * painted, and kept only as pictures: the text underneath is gone for good.
 * Scanned pages need `readWords`; without it they cannot be blacked out.
 */
export async function redactPdf(
  bytes: Uint8Array,
  itemTexts: string[],
  readWords: ((gray: GrayImage) => Promise<OcrWord[]>) | null,
  signal?: AbortSignal,
): Promise<RedactedPdf> {
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
  }).promise;
  try {
    if (doc.numPages > MAX_BLACKOUT_PAGES) throw new Error(`A blacked-out copy is only made for PDFs up to ${MAX_BLACKOUT_PAGES} pages.`);
    const count = doc.numPages;
    const pages: JpegPage[] = [];
    const found = new Set<string>();

    for (let n = 1; n <= count; n++) {
      if (signal?.aborted) throw new DOMException('PDF redaction canceled', 'AbortError');
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(REDACT_DPI / 72, MAX_SIDE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No 2D canvas available.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await withTimeout(
        page.render({ canvasContext: context, viewport, intent: 'print' }).promise,
        PAGE_TIMEOUT_MS,
        'Drawing a PDF page took too long.',
      );

      const content = await page.getTextContent();
      const layer = content.items.map((i) => ('str' in i ? i.str : '')).join('').trim();
      let words: OcrWord[] = [];
      if (layer.length >= MIN_TEXT_LAYER_CHARS) {
        words = textLayerWords(content.items as never, viewport.transform, scale);
      } else if (readWords) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        words = await readWords(rgbaToGray(image.data, image.width, image.height));
      }

      const located = locateEverywhere(words, itemTexts);
      for (const text of located.found) found.add(text);
      context.fillStyle = '#000';
      const pad = Math.max(2, Math.round(canvas.height / 400));
      for (const b of located.boxes) {
        context.fillRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('Could not write a page of the blacked-out PDF.');
      pages.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        pxWidth: canvas.width,
        pxHeight: canvas.height,
        ptWidth: base.width,
        ptHeight: base.height,
      });
      page.cleanup();
      // Release the page's pixels before the next one.
      canvas.width = canvas.height = 0;
    }

    return {
      pdf: buildPdfFromJpegs(pages),
      pages: pages.length,
      missed: [...new Set(itemTexts)].filter((text) => !found.has(text)),
    };
  } finally {
    await doc.destroy();
  }
}
