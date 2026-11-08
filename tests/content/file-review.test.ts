/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, zipSync } from 'fflate';
import { buildReplacedFile, requestPdfRedaction } from '../../src/content/file-review';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = () =>
  zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Hej</w:t></w:r></w:p></w:body></w:document>`) });

function fileWithBytes(bytes: Uint8Array, name: string): File {
  const file = new File([bytes as BlobPart], name);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return file;
}

describe('the name of the copy that is attached', () => {
  test.each([
    ['text', 'Mette_Hansen.txt', 'CV_[PERSON_1].txt', 'CV_[PERSON_1]-anonymised.txt'],
    ['pdf', 'Mette_Hansen.pdf', 'CV_[PERSON_1].pdf', 'CV_[PERSON_1]-anonymised.txt'],
    ['docx', 'Mette_Hansen.docx', 'CV_[PERSON_1].docx', 'CV_[PERSON_1]-anonymised.docx'],
  ] as const)('%s: the cleaned name replaces the original, then the suffix is added', async (kind, original, cleaned, expected) => {
    const file = kind === 'docx' ? fileWithBytes(docx(), original) : new File(['Hej'], original);
    const out = await buildReplacedFile(file, kind, 'Hej', [], cleaned);
    expect(out.name).toBe(expected);
  });

  test('without a cleaned name the original name is used, as before', async () => {
    const out = await buildReplacedFile(new File(['Hej'], 'brev.txt'), 'text', 'Hej', []);
    expect(out.name).toBe('brev-anonymised.txt');
  });

  test('the blacked-out PDF is named after the cleaned name', async () => {
    const sent: unknown[] = [];
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(async (message: unknown) => {
      sent.push(message);
      return { type: 'REDACT_PDF_RESULT', payload: { status: 'ok', dataUrl: 'data:application/pdf;base64,JVBERg==', missed: [] } };
    });
    const outcome = await requestPdfRedaction(new File(['%PDF'], 'Mette_Hansen.pdf'), ['x'], 'r1', 'CV_[PERSON_1].pdf');
    expect(outcome.file?.name).toBe('CV_[PERSON_1]-redacted.pdf');
    expect((await requestPdfRedaction(new File(['%PDF'], 'a.pdf'), ['x'], 'r2')).file?.name).toBe('a-redacted.pdf');
  });
});
