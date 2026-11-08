import { createWorker, type Worker } from 'tesseract.js';
import { set as idbSet } from 'idb-keyval';
import { cleanOcrText } from './postprocess';
import type { GrayImage, OcrAssetSource, OcrEngine, OcrResult, OcrWord } from './types';

import { TESSERACT_ENGINE_ID } from './engine-ids';

export { TESSERACT_ENGINE_ID };

/** Language files shipped in the extension. */
const LANGUAGES = ['dan', 'eng'] as const;

/**
 * Where the extension-packaged runtime lives. The worker script and the
 * WebAssembly core are part of the extension package (a downloaded script
 * would be blocked by the extension's content security policy), and so is the
 * language data. Nothing is downloaded.
 */
export interface TesseractRuntimePaths {
  workerPath: string;
  corePath: string;
}

/** tesseract.js reads Blobs, not ImageData, so the grey image is encoded as a PNG. */
async function toPngBlob(img: GrayImage): Promise<Blob> {
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0, p = 0; i < img.data.length; i++, p += 4) {
    rgba[p] = rgba[p + 1] = rgba[p + 2] = img.data[i];
    rgba[p + 3] = 255;
  }
  const canvas = new OffscreenCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas available for OCR.');
  context.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

export class TesseractEngine implements OcrEngine {
  readonly id = TESSERACT_ENGINE_ID;
  readonly label = 'Tesseract 5 (Danish + English)';
  private worker: Worker | null = null;

  constructor(private readonly runtime: TesseractRuntimePaths) {}

  async load(assets: OcrAssetSource): Promise<void> {
    if (this.worker) return;
    // tesseract.js reads language data from its IndexedDB cache before it
    // tries the network. Putting the verified bytes there means it never
    // fetches anything. The key layout (`./<lang>.traineddata`) is tesseract.js
    // 7.0.0's; the dependency is pinned to that exact version.
    for (const lang of LANGUAGES) {
      await idbSet(`./${lang}.traineddata`, new Uint8Array(await assets.read(`${lang}.traineddata`)));
    }
    this.worker = await createWorker([...LANGUAGES], 1, {
      workerPath: this.runtime.workerPath,
      corePath: this.runtime.corePath,
      // Pointing langPath at the extension itself makes a cache miss fail
      // instead of reaching for a CDN.
      langPath: this.runtime.workerPath.replace(/[^/]*$/, 'no-network'),
      workerBlobURL: false,
      cacheMethod: 'readOnly',
      gzip: false,
    });
    await this.worker.setParameters({ tessedit_pageseg_mode: '4' as never, user_defined_dpi: '300' });
  }

  async recognize(image: GrayImage, signal?: AbortSignal): Promise<OcrResult> {
    if (!this.worker) throw new Error('OCR engine is not loaded.');
    if (signal?.aborted) throw new DOMException('OCR canceled', 'AbortError');
    const started = performance.now();
    const { data } = await this.worker.recognize(await toPngBlob(image) as never, {}, { blocks: true });
    if (signal?.aborted) throw new DOMException('OCR canceled', 'AbortError');

    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            words.push({ text: word.text, confidence: word.confidence, box: word.bbox });
          }
        }
      }
    }
    const meanConfidence = words.length
      ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
      : 0;
    return {
      text: cleanOcrText(data.text ?? ''),
      words,
      meanConfidence,
      engineId: this.id,
      ms: Math.round(performance.now() - started),
    };
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
