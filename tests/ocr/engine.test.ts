import { createOcrEngine, listOcrEngineIds, registerOcrEngine } from '../../src/ocr/engine';
import type { OcrEngine } from '../../src/ocr/types';

const fake = (id: string): OcrEngine => ({
  id,
  label: id,
  load: async () => undefined,
  recognize: async () => ({ text: 'x', words: [], meanConfidence: 0, engineId: id, ms: 0 }),
  dispose: async () => undefined,
});

describe('OCR engine registry', () => {
  test('creates a registered engine by id', () => {
    registerOcrEngine('fake-a', () => fake('fake-a'));
    expect(createOcrEngine('fake-a').id).toBe('fake-a');
    expect(listOcrEngineIds()).toContain('fake-a');
  });

  test('swapping an engine only needs another registration', async () => {
    registerOcrEngine('fake-b', () => fake('fake-b'));
    registerOcrEngine('fake-b', () => fake('fake-b2'));
    expect(createOcrEngine('fake-b').id).toBe('fake-b2');
  });

  test('unknown id is an error', () => {
    expect(() => createOcrEngine('nope')).toThrow(/No OCR engine/);
  });
});
