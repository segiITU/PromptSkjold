import { buildPdfFromJpegs } from '../../src/ocr/pdf-writer';
import { locateEverywhere } from '../../src/ocr/locate';
import type { OcrWord } from '../../src/ocr/types';

const fakeJpeg = (n: number) => new Uint8Array([0xff, 0xd8, ...new Array(n).fill(7), 0xff, 0xd9]);
const page = (jpegBytes: number) => ({ jpeg: fakeJpeg(jpegBytes), pxWidth: 100, pxHeight: 140, ptWidth: 595.28, ptHeight: 841.89 });
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('buildPdfFromJpegs', () => {
  const pdf = buildPdfFromJpegs([page(10), page(300)]);
  const text = latin1(pdf);

  test('has a PDF header, one page entry per picture and an end marker', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  test('every cross-reference offset points at its object', () => {
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const lines = text.slice(xrefAt).split('\n');
    const count = Number(lines[1].split(' ')[1]);
    expect(count).toBe(3 + 2 * 3);
    for (let n = 1; n < count; n++) {
      const offset = Number(lines[2 + n].slice(0, 10));
      expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
  });

  test('the picture bytes are stored unchanged and the stream length is right', () => {
    const jpeg = fakeJpeg(300);
    const at = text.indexOf(latin1(jpeg));
    expect(at).toBeGreaterThan(0);
    expect(text).toContain(`/Length ${jpeg.length} >>`);
  });
});

describe('locateEverywhere', () => {
  const w = (text: string, x: number): OcrWord => ({
    text,
    confidence: 90,
    box: { x0: x, y0: 0, x1: x + 5, y1: 5 },
  });

  test('finds every occurrence and reports which items were found', () => {
    const words = [w('Mikkel', 0), w('og', 10), w('Mikkel', 20), w('Fatima', 30)];
    const out = locateEverywhere(words, ['Mikkel', 'Jens']);
    expect(out.boxes).toHaveLength(2);
    expect([...out.found]).toEqual(['Mikkel']);
  });

  test('finds an item that is spread over several words', () => {
    const words = [w('Rask-', 0), w('Bendtsen', 10)];
    expect(locateEverywhere(words, ['Rask-Bendtsen']).boxes).toHaveLength(2);
  });

  test('an item inside a longer one that was already blacked out still counts as found', () => {
    const words = [w('8000', 0), w('Aarhus', 10), w('C', 20)];
    const out = locateEverywhere(words, ['Jaegergaardsgade 118 8000 Aarhus C', '8000 Aarhus C']);
    expect([...out.found]).toEqual(['8000 Aarhus C']);
    expect(out.boxes).toHaveLength(3);
  });

  test('a word is only blacked out once even when two items overlap', () => {
    const words = [w('Mikkel', 0), w('Rask', 10)];
    expect(locateEverywhere(words, ['Mikkel Rask', 'Mikkel']).boxes).toHaveLength(2);
  });
});
