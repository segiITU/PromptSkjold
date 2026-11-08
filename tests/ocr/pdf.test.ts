import { MAX_OCR_PAGES, MAX_PDF_PAGES, annotationsToText, extractPdfText, type PdfDocumentSource } from '../../src/ocr/pdf';
import type { GrayImage } from '../../src/ocr/types';

const blank: GrayImage = { width: 2, height: 2, data: new Uint8ClampedArray(4) };

function fakeDoc(layers: string[]): PdfDocumentSource & { rendered: number[]; destroyed: boolean } {
  const rendered: number[] = [];
  return {
    numPages: layers.length,
    rendered,
    destroyed: false,
    async page(n) {
      return {
        getText: async () => layers[n - 1],
        renderGray: async () => {
          rendered.push(n);
          return blank;
        },
      };
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

const LONG = 'CPR 140692-1234 og telefon 51 77 20 96';

describe('extractPdfText', () => {
  test('uses the text layer and never renders a page that has one', async () => {
    const doc = fakeDoc([LONG, `${LONG} side to`]);
    const ocr = jest.fn(async () => 'should not be used');
    const out = await extractPdfText(doc, ocr);
    expect(out.text).toBe(`${LONG}\n\n${LONG} side to`);
    expect(out.pages.map((p) => p.kind)).toEqual(['text', 'text']);
    expect(ocr).not.toHaveBeenCalled();
    expect(doc.rendered).toEqual([]);
  });

  test('sends only the scanned pages to OCR', async () => {
    const doc = fakeDoc([LONG, '', 'x']);
    const out = await extractPdfText(doc, async () => 'Mikkel Rask-Bendtsen');
    expect(out.pages.map((p) => p.kind)).toEqual(['text', 'ocr', 'ocr']);
    expect(doc.rendered).toEqual([2, 3]);
    expect(out.text).toContain('Mikkel Rask-Bendtsen');
  });

  test('without OCR, scanned pages are reported rather than skipped silently', async () => {
    const doc = fakeDoc([LONG, '']);
    const out = await extractPdfText(doc, null);
    expect(out.pages.map((p) => p.kind)).toEqual(['text', 'not-read']);
    expect(out.unreadScans).toBe(1);
  });

  test('reads at most MAX_PDF_PAGES and says so', async () => {
    const doc = fakeDoc(Array.from({ length: MAX_PDF_PAGES + 5 }, () => LONG));
    const out = await extractPdfText(doc, null);
    expect(out.pages).toHaveLength(MAX_PDF_PAGES);
    expect(out.truncated).toBe(true);
  });

  test('a long PDF with a text layer is read in full', async () => {
    const out = await extractPdfText(fakeDoc(new Array(60).fill(LONG)), null);
    expect(out.pages).toHaveLength(60);
    expect(out.truncated).toBe(false);
    expect(out.unreadScans).toBe(0);
  });

  test('only the first scanned pages are sent to OCR, the rest are reported', async () => {
    const doc = fakeDoc(new Array(MAX_OCR_PAGES + 4).fill(''));
    const out = await extractPdfText(doc, async () => 'text');
    expect(doc.rendered).toHaveLength(MAX_OCR_PAGES);
    expect(out.unreadScans).toBe(4);
    expect(out.unreadReason).toBe('limit');
  });

  test('without OCR the reason is that it is not installed', async () => {
    const out = await extractPdfText(fakeDoc(['']), null);
    expect(out.unreadReason).toBe('no-ocr');
  });

  test('stops when canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractPdfText(fakeDoc([LONG]), null, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('annotations and form fields', () => {
  /** A document whose pages have a text layer and a list of annotation texts. */
  function withAnnotations(layers: string[], annotations: Array<string | undefined>): PdfDocumentSource {
    return {
      numPages: layers.length,
      destroy: () => undefined,
      async page(n) {
        return {
          getText: async () => layers[n - 1],
          getAnnotationText: annotations[n - 1] === undefined ? undefined : async () => annotations[n - 1] as string,
          renderGray: async () => blank,
        };
      },
    };
  }

  test('what is typed into a form field or a comment is part of the page text', async () => {
    const out = await extractPdfText(withAnnotations([LONG], ['Navn: Mette Hansen\nCPR: 010190-1234']), null);
    expect(out.text).toBe(`${LONG}\nNavn: Mette Hansen\nCPR: 010190-1234`);
    expect(out.pages).toEqual([{ page: 1, kind: 'text' }]);
  });

  test('a scanned page keeps its annotations next to the OCR text', async () => {
    const out = await extractPdfText(withAnnotations(['x'], ['Note: Ring til 51 77 20 96']), async () => 'scanned words');
    expect(out.text).toBe('x\nscanned words\nNote: Ring til 51 77 20 96');
  });

  test('an unread scan still gives up its annotations', async () => {
    const out = await extractPdfText(withAnnotations([''], ['Mette Hansen']), null);
    expect(out.text).toBe('Mette Hansen');
    expect(out.unreadScans).toBe(1);
  });

  test('a document without annotation support reads as before', async () => {
    const out = await extractPdfText(withAnnotations([LONG], [undefined]), null);
    expect(out.text).toBe(LONG);
  });
});

describe('annotationsToText', () => {
  test('collects comment text, field values and authors once each, skipping empty and non-text values', () => {
    expect(
      annotationsToText([
        // The shape pdf.js 4 reports (checked against a real PDF): text and author as { str, dir }.
        { subtype: 'Text', contentsObj: { str: 'Ring til Mette', dir: 'ltr' }, titleObj: { str: 'Anders Jensen', dir: 'ltr' } },
        { subtype: 'Popup', contentsObj: { str: 'Ring til Mette', dir: 'ltr' }, titleObj: { str: 'Anders Jensen', dir: 'ltr' } },
        { subtype: 'FreeText', contents: 'plain string form', title: '' },
        { subtype: 'Widget', fieldType: 'Tx', fieldValue: 'Mette Hansen' },
        { subtype: 'Widget', fieldType: 'Ch', fieldValue: ['Aarhus', 'Odense'] },
        { subtype: 'Widget', fieldType: 'Btn', fieldValue: 'Off', checkBox: true },
        { subtype: 'Widget', fieldType: 'Tx', fieldValue: '   ' },
        { subtype: 'Link', url: 'https://example.com' },
        null,
        { contents: 42 },
      ]),
    ).toBe('Ring til Mette\nAnders Jensen\nplain string form\nMette Hansen\nAarhus\nOdense');
  });

  test('nothing to report is an empty string', () => {
    expect(annotationsToText([])).toBe('');
    expect(annotationsToText([{ subtype: 'Link' }])).toBe('');
  });
});
