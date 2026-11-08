/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { buildDocx, extractDocxText } from '../../src/files/docx';
import { buildPptx, extractPptxText } from '../../src/files/pptx';
import { buildXlsx, extractXlsxText } from '../../src/files/xlsx';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const DIR = path.join(__dirname, '..', 'fixtures', 'office');
const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(DIR, name)));

/** Rewrite the XML parts that match `pattern` and zip the file again. */
function rewrite(bytes: Uint8Array, pattern: RegExp, edit: (xml: string) => string): Uint8Array {
  const parts = unzipSync(bytes);
  for (const name of Object.keys(parts)) {
    if (pattern.test(name)) parts[name] = new Uint8Array(new TextEncoder().encode(edit(new TextDecoder().decode(parts[name]))));
  }
  return zipSync(parts);
}

/** Turn the text without touching what it says: rotated shapes, vertical text, rotated cells. */
const rotatePptx = (b: Uint8Array) =>
  rewrite(b, /^ppt\/slides\/slide\d+\.xml$/, (xml) =>
    xml.replace(/<a:xfrm(?=[ >])/g, '<a:xfrm rot="5400000"').replace(/<a:bodyPr(?=[ />])/g, '<a:bodyPr vert="vert270"'));
const rotateDocx = (b: Uint8Array) =>
  rewrite(b, /^word\/document\.xml$/, (xml) =>
    xml.replace(/<w:p>/g, '<w:p><w:pPr><w:textDirection w:val="btLr"/></w:pPr>').replace(/<w:sectPr([ >])/, '<w:sectPr$1<w:textDirection w:val="tbRl"/>'));
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border/></borders><cellXfs count="2"><xf/><xf applyAlignment="1"><alignment textRotation="90"/></xf></cellXfs></styleSheet>';
/** Every cell gets a style that turns its text by 90 degrees (the file has no styles part of its own). */
const rotateXlsx = (b: Uint8Array) => {
  const parts = unzipSync(b);
  parts['xl/styles.xml'] = new Uint8Array(new TextEncoder().encode(STYLES));
  for (const name of Object.keys(parts)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      parts[name] = new Uint8Array(new TextEncoder().encode(new TextDecoder().decode(parts[name]).replace(/<c /g, '<c s="1" ')));
    }
  }
  return zipSync(parts);
};

describe('rotated content in Office files', () => {
  test('a PowerPoint with rotated shapes and vertical text gives the same text', () => {
    const original = read('syntetisk-testdata.pptx');
    const turned = rotatePptx(original);
    expect(new TextDecoder().decode(unzipSync(turned)['ppt/slides/slide1.xml'])).toContain('rot="5400000"');
    expect(extractPptxText(turned)).toBe(extractPptxText(original));
  });

  test('a Word file with vertical text gives the same text', () => {
    const original = read('skjult-word.docx');
    const turned = rotateDocx(original);
    expect(new TextDecoder().decode(unzipSync(turned)['word/document.xml'])).toContain('btLr');
    expect(extractDocxText(turned)).toBe(extractDocxText(original));
  });

  test('an Excel file with rotated cells gives the same text', () => {
    const original = read('syntetisk-testdata.xlsx');
    const turned = rotateXlsx(original);
    expect(new TextDecoder().decode(unzipSync(turned)['xl/styles.xml'])).toContain('textRotation="90"');
    expect(extractXlsxText(turned)).toBe(extractXlsxText(original));
  });

  test('the replaced copy of a rotated file keeps the rotation and loses the value', () => {
    const turned = rotatePptx(read('syntetisk-testdata.pptx'));
    const text = extractPptxText(turned);
    const value = text.match(/\d{6}-\d{4}/)?.[0];
    expect(value).toBeDefined();
    const at = text.indexOf(value as string);
    const copy = buildPptx(turned, [{ start: at, end: at + (value as string).length, text: '[CPR_1]' } as never]);
    const xml = new TextDecoder().decode(unzipSync(copy)['ppt/slides/slide1.xml']);
    expect(xml).toContain('rot="5400000"');
    expect(extractPptxText(copy)).not.toContain(value as string);
    expect(extractPptxText(copy)).toContain('[CPR_1]');
  });

  test('sanity: the unrotated builders are untouched by these edits', () => {
    expect(buildDocx(read('skjult-word.docx'), []).length).toBeGreaterThan(0);
    expect(buildXlsx(read('skjult-excel.xlsx'), []).length).toBeGreaterThan(0);
  });
});
