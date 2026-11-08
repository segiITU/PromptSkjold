import { MAX_IMAGE_PIXELS, imageDimensions } from '../files/image-size';
import { sniffBinaryKind } from '../files/kinds';
import { createOcrEngine, registerOcrEngine } from '../ocr/engine';
import { openBundledPack } from '../ocr/asset-store';
import { locateItems, scaleBox } from '../ocr/locate';
import { extractPdfText } from '../ocr/pdf';
import { prepareForOcr, rgbaToGray } from '../ocr/preprocess';
import { TESSERACT_ENGINE_ID, TesseractEngine } from '../ocr/tesseract-engine';
import type { GrayImage, OcrEngine } from '../ocr/types';
import type { DetectionOptions, OcrResultResponse, RedactPdfResponse } from '../shared/message-types';
import { detectWithExternalNer } from './detection';
import { openPdf } from './pdf-loader';
import { redactPdf } from './pdf-redact';

registerOcrEngine(
  TESSERACT_ENGINE_ID,
  () =>
    new TesseractEngine({
      workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
      corePath: chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js'),
    }),
);

/** The engine is freed this long after the last file so the WASM memory is returned. */
const ENGINE_IDLE_MS = 60_000;
/** PDFs larger than this (after decoding) are not opened. */
const MAX_PDF_BYTES = 25 * 1024 * 1024;

let engine: OcrEngine | null = null;
let loading: Promise<OcrEngine> | null = null;
let idleTimer: number | undefined;

async function getEngine(): Promise<OcrEngine> {
  window.clearTimeout(idleTimer);
  if (engine) return engine;
  loading ??= (async () => {
    const created = createOcrEngine(TESSERACT_ENGINE_ID);
    await created.load(openBundledPack());
    engine = created;
    return created;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

function scheduleIdleDispose(): void {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    const current = engine;
    engine = null;
    void current?.dispose();
  }, ENGINE_IDLE_MS);
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma);
  if (!dataUrl.startsWith('data:') || comma < 0 || !header.endsWith(';base64')) {
    throw new Error('Not a base64 data URL.');
  }
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: header.slice(0, -';base64'.length) };
}

/** An image with more pixels than {@link MAX_IMAGE_PIXELS}. */
class ImageTooLarge extends Error {
  constructor(width: number, height: number) {
    super(`The image is too large to check (${Math.round((width * height) / 1e6)} megapixels; the limit is ${MAX_IMAGE_PIXELS / 1e6}).`);
  }
}

function assertWithinPixelLimit(size: { width: number; height: number } | null): void {
  if (size && size.width * size.height > MAX_IMAGE_PIXELS) throw new ImageTooLarge(size.width, size.height);
}

async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageData> {
  // The header says how big the picture claims to be; decoding a small file that declares
  // 30,000 x 30,000 pixels would allocate gigabytes, so ask before the browser does.
  assertWithinPixelLimit(imageDimensions(bytes));
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  try {
    // Formats whose header was not read are checked once decoded, before the canvas copy doubles the memory.
    assertWithinPixelLimit(bitmap);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas available.');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function empty(requestId: string, status: OcrResultResponse['payload']['status'], message?: string): OcrResultResponse {
  return {
    type: 'OCR_RESULT',
    payload: { requestId, status, text: '', spans: [], boxes: [], meanConfidence: 0, ms: 0, message },
  };
}

async function readText(ocr: OcrEngine, gray: GrayImage, signal: AbortSignal) {
  const { image, scale } = prepareForOcr(gray);
  const result = await ocr.recognize(image, signal);
  return { result, scale };
}

async function runPdf(
  requestId: string,
  bytes: Uint8Array,
  config: DetectionOptions | undefined,
  signal: AbortSignal,
): Promise<OcrResultResponse> {
  if (bytes.length > MAX_PDF_BYTES) return empty(requestId, 'unreadable', 'The PDF is too large to check.');
  const started = performance.now();
  let doc;
  try {
    doc = await openPdf(bytes);
  } catch {
    return empty(requestId, 'unreadable', 'The PDF could not be opened (it may be damaged or password-protected).');
  }
  try {
    // Errors while reading come back as a reason rather than a dropped message.
    const ocr = await getEngine();
    const extraction = await extractPdfText(
      doc,
      ocr ? async (gray) => (await readText(ocr, gray, signal)).result.text : null,
      signal,
    );
    const { spans, nerCoverage } = extraction.text ? await detectWithExternalNer(extraction.text, config, signal) : { spans: [], nerCoverage: undefined };
    return {
      type: 'OCR_RESULT',
      payload: {
        requestId,
        status: 'ok',
        text: extraction.text,
        spans,
        nerCoverage,
        boxes: spans.map(() => []),
        meanConfidence: 0,
        ms: Math.round(performance.now() - started),
        pdf: {
          pages: extraction.pages,
          truncated: extraction.truncated,
          unreadScans: extraction.unreadScans,
          unreadReason: extraction.unreadReason,
          pageCount: extraction.pageCount,
        },
      },
    };
  } finally {
    await doc.destroy();
    scheduleIdleDispose();
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** A copy of a PDF with the given items painted over on every page. */
export async function runRedactPdf(
  requestId: string,
  dataUrl: string,
  items: string[],
  signal: AbortSignal,
): Promise<RedactPdfResponse> {
  const { bytes, mime } = dataUrlBytes(dataUrl);
  if (mime !== 'application/pdf') throw new Error('Not a PDF.');
  if (bytes.length > MAX_PDF_BYTES) throw new Error('The PDF is too large.');
  try {
    // Scanned pages need the text-reading engine to find where the items are.
    const ocr = await getEngine();
    const out = await redactPdf(
      bytes,
      items,
      ocr
        ? async (gray) => {
            const { result, scale } = await readText(ocr, gray, signal);
            return result.words.map((w) => ({ ...w, box: scaleBox(w.box, 1 / scale) }));
          }
        : null,
      signal,
    );
    return {
      type: 'REDACT_PDF_RESULT',
      payload: { requestId, status: 'ok', dataUrl: bytesToDataUrl(out.pdf, 'application/pdf'), missed: out.missed, pages: out.pages },
    };
  } finally {
    scheduleIdleDispose();
  }
}

/** Read the text in an image or PDF, then run the normal PII detection over it. */
export async function runOcr(
  requestId: string,
  dataUrl: string,
  config: DetectionOptions | undefined,
  signal: AbortSignal,
): Promise<OcrResultResponse> {
  let bytes: Uint8Array;
  let mime: string;
  try {
    ({ bytes, mime } = dataUrlBytes(dataUrl));
  } catch {
    return empty(requestId, 'unreadable', 'The file could not be read.');
  }

  // A PDF can arrive with a generic or missing type; its first bytes decide.
  if (mime === 'application/pdf' || sniffBinaryKind(bytes.subarray(0, 32)) === 'pdf') return runPdf(requestId, bytes, config, signal);

  let image: ImageData;
  try {
    image = await decodeImage(bytes, mime);
  } catch (error) {
    return empty(requestId, 'unreadable', error instanceof ImageTooLarge ? error.message : 'The image could not be decoded.');
  }

  try {
    const ocr = await getEngine();
    const { result, scale } = await readText(ocr, rgbaToGray(image.data, image.width, image.height), signal);
    const { spans, nerCoverage } = result.text
      ? await detectWithExternalNer(result.text, config, signal)
      : { spans: [], nerCoverage: undefined };
    return {
      type: 'OCR_RESULT',
      payload: {
        requestId,
        status: 'ok',
        text: result.text,
        spans,
        nerCoverage,
        // Boxes are mapped back to the original image's pixels.
        boxes: locateItems(result.words, spans.map((s) => s.text)).map((list) => list.map((b) => scaleBox(b, 1 / scale))),
        meanConfidence: result.meanConfidence,
        ms: result.ms,
      },
    };
  } finally {
    scheduleIdleDispose();
  }
}
