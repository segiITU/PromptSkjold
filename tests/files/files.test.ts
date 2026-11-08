/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { baseName, fileKind } from '../../src/files/kinds';
import { applyReplacements, makeCellSafe } from '../../src/files/replace';
import { buildPlainTextCopy, buildTextFile } from '../../src/files/text-file';
import { buildDocx, extractDocxText } from '../../src/files/docx';

Object.assign(globalThis, { TextEncoder, TextDecoder });

/** jsdom's File has no text(); read it the way the browser would. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A tiny but valid-enough .docx whose paragraphs are given as lists of runs. */
function makeDocx(paragraphs: string[][], extraParts: Record<string, string> = {}): Uint8Array {
  const body = paragraphs
    .map((runs) => `<w:p>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r>`).join('')}</w:p>`)
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    ...Object.fromEntries(Object.entries(extraParts).map(([k, v]) => [k, strToU8(v)])),
  });
}

describe('fileKind', () => {
  test.each([
    ['a.png', 'image/png', 'image'],
    ['a.pdf', 'application/pdf', 'pdf'],
    ['a.PDF', '', 'pdf'],
    ['a.docx', '', 'docx'],
    ['a.txt', 'text/plain', 'text'],
    ['a.csv', '', 'text'],
    ['notes.MD', '', 'text'],
    ['data.json', 'application/json', 'text'],
    ['mail.eml', '', 'text'],
    ['kontakt.vcf', 'text/vcard', 'text'],
    ['side.html', 'text/html', 'text'],
    ['config.yml', '', 'text'],
    ['a.xlsx', 'application/vnd.ms-excel', 'xlsx'],
    ['old.xls', 'application/vnd.ms-excel', null],
  ])('%s', (name, type, kind) => {
    expect(fileKind({ name, type })).toBe(kind);
  });

  test('baseName', () => {
    expect(baseName('report.final.pdf')).toBe('report.final');
    expect(baseName('noext')).toBe('noext');
  });
});

describe('applyReplacements', () => {
  test('substitutes by position and ignores overlaps', () => {
    const text = 'Hej Mikkel Rask og Fatima';
    expect(
      applyReplacements(text, [
        { start: 4, end: 15, text: '[PERSON_1]' },
        { start: 8, end: 12, text: 'X' },
        { start: 19, end: 25, text: '[PERSON_2]' },
      ]),
    ).toBe('Hej [PERSON_1] og [PERSON_2]');
  });

  test('cell-safe replacements lose delimiters and line breaks', () => {
    expect(makeCellSafe([{ start: 0, end: 1, text: 'Birkevej 14, 9999 By;\n"x"' }])[0].text).toBe('Birkevej 14 9999 By x ');
  });
});

describe('text files', () => {
  test('a CSV keeps its shape when a replacement contains a comma', async () => {
    const text = 'navn,adresse\nMikkel,"Jægergårdsgade 118, Aarhus"\n';
    const file = new File([text], 'kunder.csv', { type: 'text/csv' });
    const start = text.indexOf('Jægergårdsgade');
    const out = buildTextFile(file, text, [{ start, end: start + 'Jægergårdsgade 118, Aarhus'.length, text: 'Birkevænget 14, 9999 Nørrelunde' }]);
    expect(out.name).toBe('kunder-anonymised.csv');
    const result = await readText(out);
    expect(result.split('\n')[1].split(',')).toHaveLength(2);
    expect(result).toContain('Birkevænget 14 9999 Nørrelunde');
  });

  test('a PDF becomes a plain-text copy', async () => {
    const out = buildPlainTextCopy('brev.final.pdf', 'Hej Mikkel', [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    expect(out.name).toBe('brev.final-anonymised.txt');
    expect(await readText(out)).toBe('Hej [PERSON_1]');
  });
});

describe('Word documents', () => {
  test('extracts paragraphs as lines', () => {
    expect(extractDocxText(makeDocx([['Hej ', 'Mikkel'], ['Anden linje']]))).toBe('Hej Mikkel\nAnden linje');
  });

  test('replaces an item that is split over several runs and keeps the rest', () => {
    const bytes = makeDocx([['Jeg hedder Mik', 'kel Rask-', 'Bendtsen og bor her'], ['Tlf 51 77 20 96']], {
      'word/styles.xml': '<styles/>',
    });
    const text = extractDocxText(bytes);
    const name = 'Mikkel Rask-Bendtsen';
    const nameAt = text.indexOf(name);
    const phoneAt = text.indexOf('51 77 20 96');
    const out = buildDocx(bytes, [
      { start: nameAt, end: nameAt + name.length, text: '[PERSON_1]' },
      { start: phoneAt, end: phoneAt + '51 77 20 96'.length, text: '[PHONE_1]' },
    ]);
    expect(extractDocxText(out)).toBe('Jeg hedder [PERSON_1] og bor her\nTlf [PHONE_1]');
    // Other parts of the package are carried over untouched.
    expect(Object.keys(unzipSync(out)).sort()).toEqual(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']);
  });

  test('formatting of the runs is kept', () => {
    const bytes = makeDocx([['Hej Mikkel']]);
    const out = buildDocx(bytes, [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    const xml = new TextDecoder().decode(unzipSync(out)['word/document.xml']);
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('[PERSON_1]');
  });

  test('a file that is not a Word document is refused', () => {
    expect(() => extractDocxText(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/Not a Word document/);
  });

  test('tabs and breaks count as characters so positions stay aligned', () => {
    const doc = zipSync({
      'word/document.xml': strToU8(
        `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Navn</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Mikkel</w:t></w:r></w:p></w:body></w:document>`,
      ),
    });
    expect(extractDocxText(doc)).toBe('Navn\tMikkel');
    const out = buildDocx(doc, [{ start: 5, end: 11, text: 'X' }]);
    expect(extractDocxText(out)).toBe('Navn\tX');
  });
});
