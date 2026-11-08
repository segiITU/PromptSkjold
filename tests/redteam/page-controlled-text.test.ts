/**
 * Red-team regression tests: text the chat page controls (a reply the model was
 * tricked into writing, or a forged clipboard message) must not be able to
 * freeze the tab. Bounds are generous; they catch super-linear blow-ups, not
 * a few milliseconds.
 */
import { findVariantMatches } from '../../src/shared/placeholder-variants';

function timed(fn: () => void): number {
  const started = Date.now();
  fn();
  return Date.now() - started;
}

describe('findVariantMatches on hostile text', () => {
  const known = Array.from({ length: 300 }, (_, i) => `[PERSON_${i + 1}]`);

  test('many occurrences of known placeholders', () => {
    const text = '[PERSON_1] PERSON 2 person_3 '.repeat(5000);
    expect(timed(() => findVariantMatches(text, known))).toBeLessThan(3000);
  });

  test('long text with no placeholders', () => {
    const text = 'PERSON '.repeat(30000);
    expect(timed(() => findVariantMatches(text, known))).toBeLessThan(3000);
  });
});
