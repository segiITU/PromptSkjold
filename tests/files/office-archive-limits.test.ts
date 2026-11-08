/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, zipSync } from 'fflate';
import { MAX_EXPANDED_OFFICE_BYTES, MAX_OFFICE_PARTS, MAX_PART_BYTES, parseXml, readZipParts } from '../../src/files/ooxml-text';

Object.assign(globalThis, { TextEncoder, TextDecoder });

/** Patch only central-directory declared sizes; the guard must reject before inflation. */
function advertisedSizes(sizes: number[]): Uint8Array {
  const source = zipSync(Object.fromEntries(sizes.map((_, i) => [`part${i}.xml`, strToU8('x')])));
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let entry = 0;
  for (let i = 0; i <= source.length - 46; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    view.setUint32(i + 24, sizes[entry++], true);
    i += 45 + view.getUint16(i + 28, true) + view.getUint16(i + 30, true) + view.getUint16(i + 32, true);
  }
  return source;
}

test('normal archive reads every part', () => {
  const parts = { 'word/document.xml': strToU8('body'), 'word/header1.xml': strToU8('header') };
  expect(readZipParts(zipSync(parts))).toEqual(parts);
});

test('an oversized part rejects the entire file instead of silently omitting it', () => {
  expect(() => readZipParts(advertisedSizes([1, MAX_PART_BYTES + 1]))).toThrow(/no parts were checked/);
});

test('several individually permitted parts cannot exceed the total expansion budget', () => {
  expect(() => readZipParts(advertisedSizes([MAX_PART_BYTES, MAX_PART_BYTES, MAX_EXPANDED_OFFICE_BYTES - 2 * MAX_PART_BYTES + 1]))).toThrow(/safe checking limits/);
});

test('an excessive part count is refused before decompression', () => {
  const source = zipSync(Object.fromEntries(Array.from({ length: MAX_OFFICE_PARTS + 1 }, (_, i) => [`p${i}`, new Uint8Array()])));
  expect(() => readZipParts(source)).toThrow(/safe checking limits/);
});

test('the total expansion budget is about 40 MB, since the page thread does the unpacking', () => {
  expect(MAX_EXPANDED_OFFICE_BYTES).toBeLessThanOrEqual(40 * 1024 * 1024);
  expect(MAX_PART_BYTES).toBeLessThanOrEqual(MAX_EXPANDED_OFFICE_BYTES);
});

describe('XML with a document type declaration', () => {
  const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><w:document xmlns:w="x">&b;</w:document>';

  test.each([
    ['a document type', '<!DOCTYPE root><root/>'],
    ['an entity declaration', '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>'],
    ['entities that expand into each other', bomb],
  ])('%s is refused before it is parsed', (_name, xml) => {
    const parse = jest.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      expect(() => parseXml(strToU8(xml), 'Word document')).toThrow(/document type|entity|DOCTYPE/i);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  test('ordinary XML, including comments and processing instructions, is still parsed', () => {
    const doc = parseXml(strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><!-- note --><a><b>x</b></a>'), 'Word document');
    expect(doc.documentElement.localName).toBe('a');
  });
});
