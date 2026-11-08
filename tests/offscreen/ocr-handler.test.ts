/** @jest-environment jsdom */

jest.mock('../../src/ocr/engine', () => ({ createOcrEngine: jest.fn(), registerOcrEngine: jest.fn() }));
jest.mock('../../src/ocr/asset-store', () => ({ openBundledPack: jest.fn() }));
jest.mock('../../src/ocr/tesseract-engine', () => ({ TESSERACT_ENGINE_ID: 'tesseract', TesseractEngine: jest.fn() }));
jest.mock('../../src/ocr/pdf', () => ({ extractPdfText: jest.fn() }));
jest.mock('../../src/offscreen/detection', () => ({ detectWithExternalNer: jest.fn() }));
jest.mock('../../src/offscreen/pdf-loader', () => ({ openPdf: jest.fn() }));
jest.mock('../../src/offscreen/pdf-redact', () => ({ redactPdf: jest.fn() }));

import { runOcr } from '../../src/offscreen/ocr-handler';
import { openPdf } from '../../src/offscreen/pdf-loader';

const toDataUrl = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const signal = () => new AbortController().signal;

/** The first bytes of a PNG that declares the given size; the rest is not a valid image. */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out[24] = 8;
  out[25] = 6;
  return out;
}

describe('runOcr', () => {
  const createImageBitmap = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = createImageBitmap;
    createImageBitmap.mockRejectedValue(new Error('not a real image'));
    (openPdf as jest.Mock).mockRejectedValue(new Error('not a real pdf'));
  });

  test('a PDF that arrives with a generic type is still opened as a PDF', async () => {
    const pdf = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n'));
    const result = await runOcr('r1', toDataUrl(pdf, 'application/octet-stream'), undefined, signal());
    expect(openPdf).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(result.payload.message).toMatch(/PDF/);
  });

  test('an image that declares a huge size is refused before anything is decoded', async () => {
    const result = await runOcr('r2', toDataUrl(pngHeader(30_000, 30_000), 'image/png'), undefined, signal());
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(result.payload.status).toBe('unreadable');
    expect(result.payload.message).toMatch(/too large/i);
  });

  test('the limit is about the pixel count, not one side', async () => {
    const tooMany = await runOcr('r3', toDataUrl(pngHeader(7_000, 7_000), 'image/png'), undefined, signal());
    expect(tooMany.payload.message).toMatch(/too large/i);
    // 6,000 x 6,000 = 36 megapixels is under the limit and goes on to be decoded (the stub then fails).
    const fine = await runOcr('r4', toDataUrl(pngHeader(6_000, 6_000), 'image/png'), undefined, signal());
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(fine.payload.message).toMatch(/decoded/);
  });
});
