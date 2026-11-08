import { OCR_PACK_PATH } from './pack-manifest';
import type { OcrAssetSource } from './types';

const LEGACY_CACHE_PREFIX = 'pg-ocr-pack:';

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read access to the language files that ship inside the extension package. */
export function openBundledPack(): OcrAssetSource {
  return {
    async read(name: string): Promise<ArrayBuffer> {
      const response = await fetch(chrome.runtime.getURL(`${OCR_PACK_PATH}/${name}`));
      if (!response.ok) throw new Error(`OCR file "${name}" is missing from the extension.`);
      return response.arrayBuffer();
    },
  };
}

/**
 * Earlier versions downloaded the language files into the browser's Cache
 * storage. They now ship in the package, so the old copy is deleted.
 */
export async function removeLegacyDownloadedPack(engineId: string): Promise<void> {
  await caches.delete(`${LEGACY_CACHE_PREFIX}${engineId}`);
}
