/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, zipSync } from 'fflate';
import { fileKind, sniffBinaryKind } from '../../src/files/kinds';
import { resolveFileKinds } from '../../src/files/sniff';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => strToU8(text);
const pad = (head: Uint8Array, total = 64) => {
  const out = new Uint8Array(total);
  out.set(head);
  return out;
};

const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPEG = pad(bytes(0xff, 0xd8, 0xff, 0xe0));
const GIF = pad(ascii('GIF89a'));
const WEBP = pad(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]));
// 'BM', file size, two reserved words, pixel offset, DIB header size 40.
const BMP = pad(new Uint8Array([0x42, 0x4d, 70, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0]));
const PDF = pad(ascii('%PDF-1.7\n'));

function file(content: Uint8Array | string, name: string, type = ''): File {
  return new File([content as BlobPart], name, { type });
}

const OOXML = (main: string) => zipSync({ '[Content_Types].xml': ascii('<Types/>'), [main]: ascii('<x/>') });

describe('sniffBinaryKind', () => {
  test.each([
    ['PNG', PNG, 'image'],
    ['JPEG', JPEG, 'image'],
    ['GIF', GIF, 'image'],
    ['WebP', WEBP, 'image'],
    ['BMP', BMP, 'image'],
    ['PDF', PDF, 'pdf'],
    ['ZIP', pad(bytes(0x50, 0x4b, 0x03, 0x04)), 'zip'],
  ])('%s', (_name, head, kind) => {
    expect(sniffBinaryKind(head)).toBe(kind);
  });

  test.each([
    ['text that starts with BM', pad(ascii('BM25 ranking notes'))],
    ['RIFF that is not WebP (WAV)', pad(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]))],
    ['plain text', ascii('Hej Mikkel')],
    ['empty', new Uint8Array(0)],
  ])('%s is not a binary kind', (_name, head) => {
    expect(sniffBinaryKind(head)).toBeNull();
  });
});

describe('resolveFileKinds', () => {
  test('a picture with an empty type and no extension is an image', async () => {
    const f = file(PNG, 'blob');
    expect(fileKind(f)).toBeNull();
    await resolveFileKinds([f]);
    expect(fileKind(f)).toBe('image');
  });

  test('a picture with a wrong type and name is still an image', async () => {
    const f = file(JPEG, 'notes.txt', 'text/plain');
    expect(fileKind(f)).toBe('text');
    await resolveFileKinds([f]);
    expect(fileKind(f)).toBe('image');
  });

  test('a PDF renamed to something else is a PDF', async () => {
    const f = file(PDF, 'report.dat', 'application/octet-stream');
    await resolveFileKinds([f]);
    expect(fileKind(f)).toBe('pdf');
  });

  test.each([
    ['word/document.xml', 'docx'],
    ['xl/workbook.xml', 'xlsx'],
    ['ppt/presentation.xml', 'pptx'],
  ])('an Office package with the name stripped (%s) is %s', async (main, kind) => {
    const f = file(OOXML(main), 'attachment.bin');
    expect(fileKind(f)).toBeNull();
    await resolveFileKinds([f]);
    expect(fileKind(f)).toBe(kind);
  });

  test('an ordinary zip stays unreadable', async () => {
    const f = file(zipSync({ 'a.txt': ascii('x') }), 'bundle.zip', 'application/zip');
    await resolveFileKinds([f]);
    expect(fileKind(f)).toBeNull();
  });

  test('a file that is not a binary format keeps the kind its name and type give', async () => {
    const txt = file('Hej Mikkel', 'a.txt', 'text/plain');
    const doc = file('not really a zip', 'a.docx');
    const old = file('stuff', 'old.doc', 'application/msword');
    await resolveFileKinds([txt, doc, old]);
    expect(fileKind(txt)).toBe('text');
    expect(fileKind(doc)).toBe('docx');
    expect(fileKind(old)).toBeNull();
  });

  test('a picture with an image extension but no type is found without reading it', () => {
    expect(fileKind({ name: 'photo.JPG', type: '' })).toBe('image');
    expect(fileKind({ name: 'scan.webp', type: '' })).toBe('image');
  });
});
