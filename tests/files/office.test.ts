/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { fileKind } from '../../src/files/kinds';
import { buildPptx, extractPptxText } from '../../src/files/pptx';
import { buildXlsx, extractXlsxText } from '../../src/files/xlsx';
import type { Replacement } from '../../src/shared/anonymizer';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** Replacement for `needle` at its first position in `text`. */
function replace(text: string, needle: string, to: string, from = 0): Replacement {
  const start = text.indexOf(needle, from);
  if (start < 0) throw new Error(`"${needle}" not in text`);
  return { start, end: start + needle.length, text: to } as Replacement;
}

describe('fileKind for Excel and PowerPoint', () => {
  test.each([
    ['a.xlsx', '', 'xlsx'],
    ['a.XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['a.pptx', '', 'pptx'],
    ['a.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
    ['old.xls', 'application/vnd.ms-excel', null],
    ['old.ppt', 'application/vnd.ms-powerpoint', null],
  ])('%s', (name, type, kind) => {
    expect(fileKind({ name, type })).toBe(kind);
  });
});

// ---------------------------------------------------------------- Excel

/**
 * Sheet 1: A1 "Navn" (shared), B1 "Løn" (shared), A2 "Mette Hansen" (shared),
 * B2 48500 (number), A3 "Mette Hansen" (shared again), B3 inline text, C3 formula with cached text.
 * Sheet 2: A1 "Telefon" (shared), A2 20123456 (number).
 */
function makeXlsx(): Uint8Array {
  const shared = ['Navn', 'Løn', 'Mette Hansen', 'Telefon', 'Aldrig brugt Peter Jensen'];
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns="${S}"><sheets/></workbook>`),
    'xl/sharedStrings.xml': strToU8(
      `<sst xmlns="${S}" count="5" uniqueCount="5">${shared.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet xmlns="${S}"><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>48500</v></c></row>` +
        `<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="inlineStr"><is><t>kontakt: mette@firma.dk</t></is></c>` +
        `<c r="C3" t="str"><f>A3&amp;"!"</f><v>Mette Hansen!</v></c></row>` +
        `</sheetData></worksheet>`,
    ),
    'xl/worksheets/sheet2.xml': strToU8(
      `<worksheet xmlns="${S}"><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>3</v></c></row>` +
        `<row r="2"><c r="A2"><v>20123456</v></c></row>` +
        `</sheetData></worksheet>`,
    ),
  });
}

describe('xlsx', () => {
  test('reads cells row by row, tab separated, numbers and inline text included', () => {
    expect(extractXlsxText(makeXlsx())).toBe(
      ['Navn\tLøn', 'Mette Hansen\t48500', 'Mette Hansen\tkontakt: mette@firma.dk\tMette Hansen!', 'Telefon', '20123456'].join('\n'),
    );
  });

  test('replaces text in a cell, a number, inline text and a formula result, in any sheet', () => {
    const bytes = makeXlsx();
    const text = extractXlsxText(bytes);
    const out = buildXlsx(bytes, [
      replace(text, 'Mette Hansen', '[PERSON_1]'),
      replace(text, '48500', '[FINANCIAL_INFO_1]'),
      replace(text, 'mette@firma.dk', '[EMAIL_1]'),
      replace(text, '20123456', '[PHONE_1]'),
    ]);
    const after = extractXlsxText(out);
    expect(after).toContain('[PERSON_1]\t[FINANCIAL_INFO_1]');
    expect(after).toContain('kontakt: [EMAIL_1]');
    expect(after).toContain('[PHONE_1]');
    expect(after).not.toContain('48500');
    expect(after).not.toContain('20123456');
    expect(after).not.toContain('mette@');
  });

  test('a replaced shared string no longer exists anywhere in the file', () => {
    const bytes = makeXlsx();
    const text = extractXlsxText(bytes);
    // Both cells that use "Mette Hansen" are replaced, so the shared string must be emptied.
    const out = buildXlsx(bytes, [replace(text, 'Mette Hansen', 'X', 0), replace(text, 'Mette Hansen', 'X', text.indexOf('Mette Hansen') + 1)]);
    const parts = unzipSync(out);
    expect(Object.values(parts).map(decode).join('\n')).not.toContain('Mette Hansen\t');
    expect(decode(parts['xl/sharedStrings.xml'])).not.toContain('Mette Hansen');
    // Strings the user did not touch stay.
    expect(decode(parts['xl/sharedStrings.xml'])).toContain('Navn');
  });

  test('a shared string still used by an untouched cell is left alone', () => {
    const bytes = makeXlsx();
    const text = extractXlsxText(bytes);
    const out = buildXlsx(bytes, [replace(text, 'Mette Hansen', '[PERSON_1]')]); // first occurrence only
    const parts = unzipSync(out);
    expect(decode(parts['xl/sharedStrings.xml'])).toContain('Mette Hansen');
    expect(extractXlsxText(out)).toContain('[PERSON_1]\t48500');
    expect(extractXlsxText(out)).toContain('Mette Hansen\tkontakt');
  });

  test('turns a changed formula into plain text so recalculation cannot restore the original', () => {
    const bytes = makeXlsx();
    const text = extractXlsxText(bytes);
    const out = buildXlsx(bytes, [replace(text, 'Mette Hansen!', '[PERSON_1]!')]);
    const sheet = decode(unzipSync(out)['xl/worksheets/sheet1.xml']);
    expect(sheet).not.toContain('<f');
    expect(sheet).toContain('[PERSON_1]!');
  });

  test('removes literal originals and shared formulas, including unchanged masters and calc-chain references', () => {
    const bytes = zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'),
      'xl/workbook.xml': strToU8(`<workbook xmlns="${S}"/>`),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="calc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>'),
      'xl/calcChain.xml': strToU8(`<calcChain xmlns="${S}"><c r="A1" i="1"/></calcChain>`),
      'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${S}"><sheetData><row r="1">` +
        '<c r="A1" t="str"><f t="shared" si="0" ref="A1:B1">"secret@example.com"</f><v>public cached value</v></c>' +
        '<c r="B1" t="str"><f t="shared" si="0"/><v>secret@example.com</v></c>' +
        '<c r="C1" t="str"><f>"secret@example.com"</f><v>secret@example.com</v></c>' +
        '</row></sheetData></worksheet>'),
    });
    const text = extractXlsxText(bytes);
    const start = text.indexOf('secret@example.com');
    const out = buildXlsx(bytes, [replace(text, 'secret@example.com', '[EMAIL_1]'), replace(text, 'secret@example.com', '[EMAIL_1]', start + 1)]);
    const parts = unzipSync(out);
    const everything = Object.values(parts).map(decode).join('\n');
    expect(everything).not.toContain('secret@example.com');
    expect(everything).not.toContain('<f');
    expect(everything).not.toContain('calcChain');
    expect(extractXlsxText(out)).toBe('public cached value\t[EMAIL_1]\t[EMAIL_1]');
  });

  test('no replacements gives back the same text', () => {
    const bytes = makeXlsx();
    expect(extractXlsxText(buildXlsx(bytes, []))).toBe(extractXlsxText(bytes));
  });

  test('a file that is not a workbook is refused', () => {
    expect(() => extractXlsxText(zipSync({ 'a.txt': strToU8('x') }))).toThrow('Not an Excel file');
  });
});

// ---------------------------------------------------------------- PowerPoint

function slide(paragraphs: string[][]): string {
  const body = paragraphs
    .map((runs) => `<a:p>${runs.map((t) => `<a:r><a:rPr b="1"/><a:t>${t}</a:t></a:r>`).join('')}</a:p>`)
    .join('');
  return `<p:sld xmlns:a="${A}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

function makePptx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
    'ppt/slides/slide1.xml': strToU8(slide([['Kunde: Mette ', 'Hansen'], ['CPR 010190-1234']])),
    'ppt/slides/slide10.xml': strToU8(slide([['Slut']])),
    'ppt/slides/slide2.xml': strToU8(slide([['Telefon 20 12 34 56']])),
    'ppt/notesSlides/notesSlide1.xml': strToU8(slide([['Husk at ringe til Peter Jensen']])),
  });
}

describe('pptx', () => {
  test('reads slides in slide order (2 before 10), then notes', () => {
    expect(extractPptxText(makePptx())).toBe(
      ['Kunde: Mette Hansen', 'CPR 010190-1234', 'Telefon 20 12 34 56', 'Slut', 'Husk at ringe til Peter Jensen'].join('\n'),
    );
  });

  test('replaces text across runs, on other slides and in the notes, keeping formatting', () => {
    const bytes = makePptx();
    const text = extractPptxText(bytes);
    const out = buildPptx(bytes, [
      replace(text, 'Mette Hansen', '[PERSON_1]'),
      replace(text, '010190-1234', '[CPR_1]'),
      replace(text, '20 12 34 56', '[PHONE_1]'),
      replace(text, 'Peter Jensen', '[PERSON_2]'),
    ]);
    const after = extractPptxText(out);
    expect(after).toContain('Kunde: [PERSON_1]');
    expect(after).toContain('CPR [CPR_1]');
    expect(after).toContain('Telefon [PHONE_1]');
    expect(after).toContain('ringe til [PERSON_2]');
    expect(after).not.toMatch(/Mette|Hansen|010190|Jensen|20 12/);
    expect(decode(unzipSync(out)['ppt/slides/slide1.xml'])).toContain('<a:rPr b="1"/>');
  });

  test('no replacements gives back the same text', () => {
    const bytes = makePptx();
    expect(extractPptxText(buildPptx(bytes, []))).toBe(extractPptxText(bytes));
  });

  test('a file that is not a presentation is refused', () => {
    expect(() => extractPptxText(zipSync({ 'a.txt': strToU8('x') }))).toThrow('Not a PowerPoint file');
  });
});
