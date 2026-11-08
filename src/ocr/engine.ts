import type { OcrEngine } from './types';

/**
 * Registry of OCR engines. A new engine (a different model, or a local
 * server) is added by registering a factory; callers only know the id.
 */
const factories = new Map<string, () => OcrEngine>();

export function registerOcrEngine(id: string, factory: () => OcrEngine): void {
  factories.set(id, factory);
}

export function createOcrEngine(id: string): OcrEngine {
  const factory = factories.get(id);
  if (!factory) throw new Error(`No OCR engine registered as "${id}"`);
  return factory();
}

export function listOcrEngineIds(): string[] {
  return [...factories.keys()];
}
