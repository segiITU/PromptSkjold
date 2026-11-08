/** @jest-environment jsdom */
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import { unzipSync } from 'fflate';
import { buildDocx, extractDocxText } from '../../src/files/docx';
import { buildPptx, extractPptxText } from '../../src/files/pptx';
import { buildXlsx, extractXlsxText } from '../../src/files/xlsx';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const dir = path.join(__dirname, '..', 'fixtures', 'office');
const load = (name: string) => new Uint8Array(fs.readFileSync(path.join(dir, name)));
const everything = (zip: Uint8Array) => Object.values(unzipSync(zip)).map((b) => new TextDecoder().decode(b)).join('\n');

// Synthetic files from tests/fixtures/office/generate-hidden.js: clean body, personal data only in hidden parts.
const CASES = [
  ['skjult-word.docx', extractDocxText, buildDocx, ['Freja Syntetisk', 'Syntetisk Firma ApS', 'Lars Kommentarsen', 'Karen Sletteby']],
  ['skjult-excel.xlsx', extractXlsxText, buildXlsx, ['Freja Syntetisk', 'Syntetisk Firma ApS', 'Nina Noteby']],
  ['skjult-powerpoint.pptx', extractPptxText, buildPptx, ['Freja Syntetisk', 'Syntetisk Firma ApS', 'Poul Slidesen', 'Mads Testesen']],
] as const;

describe.each(CASES)('%s', (file, extract, build, words) => {
  // Word headers and footers are read like the body: their text is replaced when the user replaces it, so it is not in this list.
  test('everything hidden in the file is part of the text that is checked', () => {
    const text = extract(load(file));
    for (const word of words) expect(text).toContain(word);
  });

  if (file.endsWith('.docx')) {
    test('the header and the footer are read too', () => {
      const text = extract(load(file));
      expect(text).toContain('Signe Sidehoved');
      expect(text).toContain('Testvej 12');
    });
  }

  test('the rebuilt copy no longer holds any of it', () => {
    const bytes = load(file);
    const out = build(bytes, [{ start: 0, end: 9, text: 'Fiktiv' }]);
    const all = everything(out);
    for (const word of words) expect(all).not.toContain(word);
    expect(extract(out)).toContain('Fiktiv');
  });
});
