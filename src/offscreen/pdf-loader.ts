import * as pdfjs from 'pdfjs-dist';
import { rgbaToGray } from '../ocr/preprocess';
import { annotationsToText, type PdfDocumentSource } from '../ocr/pdf';

/** Resolution pages are drawn at for OCR (dots per inch; PDF units are 72 per inch). */
const RENDER_DPI = 200;
const MAX_RENDER_SIDE = 3500;
const PAGE_RENDER_TIMEOUT_MS = 30_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('ocr/pdf.worker.min.mjs');

/** Open a PDF from bytes. Everything runs in this extension page; nothing is fetched. */
export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentSource> {
  const task = pdfjs.getDocument({
    data: bytes,
    // The extension's content security policy forbids eval.
    isEvalSupported: false,
  });
  const doc = await task.promise;

  return {
    numPages: doc.numPages,
    async page(number) {
      const page = await doc.getPage(number);
      return {
        async getText() {
          const content = await page.getTextContent();
          let out = '';
          for (const item of content.items) {
            if ('str' in item) out += item.str + (item.hasEOL ? '\n' : ' ');
          }
          return out;
        },
        async getAnnotationText() {
          return annotationsToText(await page.getAnnotations());
        },
        async renderGray() {
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(RENDER_DPI / 72, MAX_RENDER_SIDE / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('No 2D canvas available.');
          // Scans have a transparent background until drawn on white.
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          // `intent: 'print'` keeps pdf.js from waiting on requestAnimationFrame, which
          // never fires in this hidden page and would hang the render.
          await withTimeout(
            page.render({ canvasContext: context, viewport, intent: 'print' }).promise,
            PAGE_RENDER_TIMEOUT_MS,
            'Drawing a PDF page took too long.',
          );
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          page.cleanup();
          return rgbaToGray(image.data, image.width, image.height);
        },
      };
    },
    destroy: () => doc.destroy(),
  };
}
