import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openBundledPack, removeLegacyDownloadedPack, sha256Hex } from '../../src/ocr/asset-store';
import { TESSERACT_PACK } from '../../src/ocr/pack-manifest';

const VENDOR_DIR = path.resolve(__dirname, '../../vendor-data/ocr');

describe('the packaged OCR language files', () => {
  test.each(TESSERACT_PACK.files)('$name is exactly the pinned file', ({ name, sha256, bytes }) => {
    const data = fs.readFileSync(path.join(VENDOR_DIR, name));
    expect(data.length).toBe(bytes);
    expect(createHash('sha256').update(data).digest('hex')).toBe(sha256);
  });

  test('sha256Hex agrees with node', async () => {
    const data = Buffer.from('hello');
    expect(await sha256Hex(data.buffer.slice(data.byteOffset, data.byteOffset + data.length) as ArrayBuffer)).toBe(
      createHash('sha256').update(data).digest('hex'),
    );
  });
});

describe('openBundledPack', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  test('reads a file from the extension package', async () => {
    (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://id/${p}` } };
    const requested: string[] = [];
    (globalThis as { fetch?: unknown }).fetch = async (url: string) => {
      requested.push(url);
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    };
    const bytes = await openBundledPack().read('dan.traineddata');
    expect(requested).toEqual(['chrome-extension://id/ocr/lang/dan.traineddata']);
    expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3]);
  });

  test('a missing file is an error, never a network fallback', async () => {
    (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => `chrome-extension://id/${p}` } };
    (globalThis as { fetch?: unknown }).fetch = async () => ({ ok: false });
    await expect(openBundledPack().read('xx.traineddata')).rejects.toThrow('missing from the extension');
  });
});

describe('removeLegacyDownloadedPack', () => {
  test('deletes the old downloaded cache', async () => {
    const deleted: string[] = [];
    (globalThis as { caches?: unknown }).caches = { delete: async (name: string) => void deleted.push(name) };
    await removeLegacyDownloadedPack('tesseract-5');
    expect(deleted).toEqual(['pg-ocr-pack:tesseract-5']);
    delete (globalThis as { caches?: unknown }).caches;
  });
});
