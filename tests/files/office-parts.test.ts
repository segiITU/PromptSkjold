/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { buildDocx, extractDocxText } from '../../src/files/docx';
import { buildPptx, extractPptxText } from '../../src/files/pptx';
import { buildXlsx, extractXlsxText } from '../../src/files/xlsx';
import { officeNotes } from '../../src/content/attachment-interceptor';
import { uncheckedOfficeParts } from '../../src/files/ooxml-strip';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const everything = (zip: Uint8Array) => Object.values(unzipSync(zip)).map(decode).join('\n');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CORE = '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Anders Jensen</dc:creator><cp:lastModifiedBy>Mette Hansen</cp:lastModifiedBy></cp:coreProperties>';
const APP = '<Properties><Company>Jensen &amp; Co ApS</Company></Properties>';
const rootRels = () =>
  `<Relationships xmlns="${REL}"><Relationship Id="r1" Type="${OD}/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="r2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="r3" Type="${OD}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const override = (part: string) => `<Override PartName="${part}" ContentType="application/xml"/>`;
const zipOf = (parts: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)])));

function docx(parts: Record<string, string> = {}, body = '<w:p><w:r><w:t>Hej Mikkel</w:t></w:r></w:p>'): Uint8Array {
  return zipOf({
    '[Content_Types].xml': `<Types xmlns="${CT}">${override('/docProps/core.xml')}${override('/docProps/app.xml')}${override('/word/comments.xml')}</Types>`,
    '_rels/.rels': rootRels(),
    'docProps/core.xml': CORE,
    'docProps/app.xml': APP,
    'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="c1" Type="${OD}/comments" Target="comments.xml"/><Relationship Id="s1" Type="${OD}/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `<w:styles xmlns:w="${W}"/>`,
    'word/comments.xml': `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Mette Hansen"><w:p><w:r><w:t>Ring til 20123456</w:t></w:r></w:p></w:comment></w:comments>`,
    ...parts,
  });
}

describe('Word: parts the text pass does not read', () => {
  test('metadata is removed from the copy, with its relationships and content types', () => {
    const out = buildDocx(docx(), [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    const parts = unzipSync(out);
    expect(Object.keys(parts).some((n) => n.startsWith('docProps/'))).toBe(false);
    expect(decode(parts['_rels/.rels'])).not.toContain('docProps');
    expect(decode(parts['_rels/.rels'])).toContain('word/document.xml');
    expect(decode(parts['[Content_Types].xml'])).not.toContain('docProps');
    expect(everything(out)).not.toContain('Anders Jensen');
    expect(everything(out)).not.toContain('Jensen &amp; Co');
  });

  test('comments are removed, together with the references to them', () => {
    const body =
      '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Hej Mikkel</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>';
    const out = buildDocx(docx({}, body), [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    const parts = unzipSync(out);
    expect(parts['word/comments.xml']).toBeUndefined();
    expect(decode(parts['word/_rels/document.xml.rels'])).not.toContain('comments');
    expect(decode(parts['word/_rels/document.xml.rels'])).toContain('styles.xml');
    expect(decode(parts['[Content_Types].xml'])).not.toContain('comments');
    expect(decode(parts['word/document.xml'])).not.toMatch(/comment(Range|Reference)/);
    expect(everything(out)).not.toContain('20123456');
    expect(extractDocxText(out)).toBe('Hej [PERSON_1]');
  });

  test('tracked deletions lose their text, and tracked changes lose their author', () => {
    const body =
      '<w:p><w:r><w:t>Hej Mikkel</w:t></w:r><w:del w:id="1" w:author="Anders Jensen" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Peter Nielsen</w:delText></w:r></w:del>' +
      '<w:ins w:id="2" w:author="Anders Jensen"><w:r><w:t> ok</w:t></w:r></w:ins></w:p>';
    const out = buildDocx(docx({}, body), [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    const xml = decode(unzipSync(out)['word/document.xml']);
    expect(xml).not.toContain('Peter Nielsen');
    expect(xml).not.toContain('Anders Jensen');
    expect(xml).toContain('<w:ins'); // the change itself stays
  });

  test('headers, footers, footnotes and endnotes are read and replaced', () => {
    const bytes = docx({
      'word/header1.xml': `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Fortroligt: Mikkel Rask</w:t></w:r></w:p></w:hdr>`,
      'word/footer1.xml': `<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>Tlf 51 77 20 96</w:t></w:r></w:p></w:ftr>`,
      'word/footnotes.xml': `<w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>Kilde: Peter Nielsen</w:t></w:r></w:p></w:footnote></w:footnotes>`,
      'word/endnotes.xml': `<w:endnotes xmlns:w="${W}"><w:endnote w:id="1"><w:p><w:r><w:t>Se Lone Vest</w:t></w:r></w:p></w:endnote></w:endnotes>`,
    });
    const text = extractDocxText(bytes);
    const words = ['Mikkel Rask', '51 77 20 96', 'Peter Nielsen', 'Lone Vest'];
    for (const word of words) expect(text).toContain(word);
    const at = (s: string) => ({ start: text.indexOf(s), end: text.indexOf(s) + s.length });
    const out = buildDocx(bytes, [
      { ...at('Mikkel Rask'), text: '[PERSON_1]' },
      { ...at('51 77 20 96'), text: '[PHONE_1]' },
      { ...at('Peter Nielsen'), text: '[PERSON_2]' },
      { ...at('Lone Vest'), text: '[PERSON_3]' },
    ]);
    for (const word of words) expect(everything(out)).not.toContain(word);
    expect(extractDocxText(out)).toContain('[PERSON_3]');
  });

  test('lists the parts that are still not checked', () => {
    const bytes = docx({ 'customXml/item1.xml': '<x/>', 'word/media/image1.png': 'png', 'word/charts/chart1.xml': '<c/>' });
    expect(uncheckedOfficeParts(bytes)).toEqual(expect.arrayContaining(['customXml', 'media', 'charts']));
    expect(uncheckedOfficeParts(docx())).toEqual([]);
  });

  test('the review says what is removed and what is not checked', async () => {
    const bytes = docx({ 'word/media/image1.png': 'png' });
    const file = { arrayBuffer: async () => bytes.buffer } as unknown as File;
    const notes = await officeNotes(file, 'docx');
    expect(notes).toHaveLength(2);
    expect(notes[1]).toMatch(/images|billeder/);
    expect(await officeNotes(file, 'text')).toEqual([]);
  });
});

describe('hidden text is checked too', () => {
  test('Word: author, company, comments and deleted text come after the body text, so a clean-looking file is still reviewed', () => {
    const body =
      '<w:p><w:r><w:t>Hej Mikkel</w:t></w:r><w:del w:id="1" w:author="Lone Revisor"><w:r><w:delText>Peter Nielsen</w:delText></w:r></w:del></w:p>';
    const text = extractDocxText(docx({}, body));
    expect(text.startsWith('Hej Mikkel\n')).toBe(true);
    for (const hidden of ['Anders Jensen', 'Mette Hansen', 'Jensen & Co ApS', 'Ring til 20123456', 'Peter Nielsen', 'Lone Revisor']) {
      expect(text).toContain(hidden);
    }
    // File dates and counts are not personal data and would only add noise.
    expect(extractDocxText(docx({ 'docProps/core.xml': `${CORE.replace('</cp:coreProperties>', '<dcterms:created>2026-01-01T10:00:00Z</dcterms:created></cp:coreProperties>')}` }, body))).not.toContain('2026-01-01');
  });

  test('replacing something in the hidden block changes nothing in the body, and the copy no longer holds it', () => {
    const bytes = docx();
    const text = extractDocxText(bytes);
    const at = text.indexOf('Anders Jensen');
    const out = buildDocx(bytes, [{ start: at, end: at + 13, text: '[PERSON_1]' }]);
    expect(extractDocxText(out)).toBe('Hej Mikkel');
    expect(everything(out)).not.toContain('Anders Jensen');
  });

  test('Excel and PowerPoint: comment text and authors', () => {
    const sheetBook = zipOf({
      '[Content_Types].xml': `<Types xmlns="${CT}"/>`,
      'docProps/core.xml': CORE,
      'xl/workbook.xml': `<workbook xmlns="${S}"/>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Navn</t></is></c></row></sheetData></worksheet>`,
      'xl/comments1.xml': `<comments xmlns="${S}"><authors><author>Mette Hansen</author></authors><commentList><comment ref="A1"><text><r><t>Privat: 20123456</t></r></text></comment></commentList></comments>`,
    });
    const xlsxText = extractXlsxText(sheetBook);
    expect(xlsxText.startsWith('Navn\n')).toBe(true);
    for (const hidden of ['Anders Jensen', 'Mette Hansen', 'Privat: 20123456']) expect(xlsxText).toContain(hidden);

    const pptx = zipOf({
      '[Content_Types].xml': `<Types xmlns="${CT}"/>`,
      'ppt/presentation.xml': '<p:presentation xmlns:p="x"/>',
      'ppt/slides/slide1.xml': `<p:sld xmlns:p="x" xmlns:a="${A}"><a:p><a:r><a:t>Hej</a:t></a:r></a:p></p:sld>`,
      'ppt/commentAuthors.xml': '<p:cmAuthorLst xmlns:p="x"><p:cmAuthor name="Anders Jensen" initials="AJ"/></p:cmAuthorLst>',
      'ppt/comments/comment1.xml': '<p:cmLst xmlns:p="x"><p:cm><p:text>Ring til 20123456</p:text></p:cm></p:cmLst>',
    });
    const pptxText = extractPptxText(pptx);
    expect(pptxText.startsWith('Hej\n')).toBe(true);
    expect(pptxText).toContain('Anders Jensen');
    expect(pptxText).toContain('Ring til 20123456');
  });

  test('a file with nothing hidden reads exactly as before', () => {
    const plain = zipOf({ 'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Hej</w:t></w:r></w:p></w:body></w:document>` });
    expect(extractDocxText(plain)).toBe('Hej');
  });
});

describe('Excel: parts the text pass does not read', () => {
  const sheet =
    `<worksheet xmlns="${S}" xmlns:r="${OD}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Mette Hansen</t></is></c></row></sheetData>` +
    '<legacyDrawing r:id="v1"/></worksheet>';
  const bytes = zipOf({
    '[Content_Types].xml': `<Types xmlns="${CT}">${override('/docProps/core.xml')}${override('/xl/comments1.xml')}${override('/xl/threadedComments/threadedComment1.xml')}</Types>`,
    '_rels/.rels': rootRels(),
    'docProps/core.xml': CORE,
    'docProps/app.xml': APP,
    'xl/workbook.xml': `<workbook xmlns="${S}"/>`,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/_rels/sheet1.xml.rels':
      `<Relationships xmlns="${REL}"><Relationship Id="c1" Type="${OD}/comments" Target="../comments1.xml"/>` +
      `<Relationship Id="v1" Type="${OD}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>` +
      '<Relationship Id="t1" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/></Relationships>',
    'xl/comments1.xml': `<comments xmlns="${S}"><authors><author>Mette Hansen</author></authors><commentList><comment ref="A1"><text><r><t>Privat: 20123456</t></r></text></comment></commentList></comments>`,
    'xl/threadedComments/threadedComment1.xml': '<ThreadedComments><threadedComment><text>Peter Nielsen</text></threadedComment></ThreadedComments>',
    'xl/drawings/vmlDrawing1.vml': '<xml/>',
  });

  test('metadata and comments are removed, and the sheet no longer points at them', () => {
    const text = extractXlsxText(bytes);
    const out = buildXlsx(bytes, [{ start: 0, end: text.length, text: '[PERSON_1]' }]);
    const parts = unzipSync(out);
    expect(Object.keys(parts).filter((n) => /docProps|comments|vml/i.test(n))).toEqual([]);
    expect(decode(parts['xl/worksheets/_rels/sheet1.xml.rels'])).not.toMatch(/comments|vml/i);
    expect(decode(parts['xl/worksheets/sheet1.xml'])).not.toContain('legacyDrawing');
    expect(decode(parts['[Content_Types].xml'])).not.toMatch(/comments|docProps/i);
    for (const word of ['Anders Jensen', '20123456', 'Peter Nielsen']) expect(everything(out)).not.toContain(word);
  });
});

describe('Excel: drawings that are not the comment boxes', () => {
  const rels = (...items: string[]) => `<Relationships xmlns="${REL}">${items.join('')}</Relationships>`;
  const comments = `<Relationship Id="c1" Type="${OD}/comments" Target="../comments1.xml"/>`;
  const vml = (id: string, file: string) => `<Relationship Id="${id}" Type="${OD}/vmlDrawing" Target="../drawings/${file}"/>`;
  const book = (sheetTail: string, relItems: string[]) =>
    zipOf({
      '[Content_Types].xml': `<Types xmlns="${CT}"/>`,
      'xl/workbook.xml': `<workbook xmlns="${S}"/>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}" xmlns:r="${OD}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Mette</t></is></c></row></sheetData>${sheetTail}</worksheet>`,
      'xl/worksheets/_rels/sheet1.xml.rels': rels(...relItems),
      'xl/comments1.xml': `<comments xmlns="${S}"/>`,
      'xl/drawings/vmlDrawing1.vml': '<xml/>',
      'xl/drawings/vmlDrawing2.vml': '<xml/>',
    });

  test('a header/footer picture keeps its drawing and its pointer', () => {
    const bytes = book('<legacyDrawing r:id="v1"/><legacyDrawingHF r:id="v2"/>', [comments, vml('v1', 'vmlDrawing1.vml'), vml('v2', 'vmlDrawing2.vml')]);
    const parts = unzipSync(buildXlsx(bytes, [{ start: 0, end: 5, text: 'X' }]));
    expect(parts['xl/drawings/vmlDrawing1.vml']).toBeUndefined();
    expect(parts['xl/drawings/vmlDrawing2.vml']).toBeDefined();
    expect(decode(parts['xl/worksheets/_rels/sheet1.xml.rels'])).toContain('v2');
    expect(decode(parts['xl/worksheets/sheet1.xml'])).toContain('legacyDrawingHF');
  });

  test('form controls keep the drawing they share with the comments', () => {
    const bytes = book('<legacyDrawing r:id="v1"/><controls/>', [comments, vml('v1', 'vmlDrawing1.vml')]);
    const parts = unzipSync(buildXlsx(bytes, [{ start: 0, end: 5, text: 'X' }]));
    expect(parts['xl/drawings/vmlDrawing1.vml']).toBeDefined();
    expect(decode(parts['xl/worksheets/sheet1.xml'])).toContain('legacyDrawing');
    expect(parts['xl/comments1.xml']).toBeUndefined();
  });
});

describe('PowerPoint: modern comments', () => {
  test('the slide no longer points at the comments that were removed', () => {
    const bytes = zipOf({
      '[Content_Types].xml': `<Types xmlns="${CT}"/>`,
      'ppt/presentation.xml': '<p:presentation xmlns:p="x"/>',
      'ppt/slides/slide1.xml':
        `<p:sld xmlns:p="x" xmlns:a="${A}" xmlns:r="${OD}"><a:p><a:r><a:t>Hej Mikkel</a:t></a:r></a:p>` +
        '<p:extLst><p:ext uri="u"><p188:commentRel xmlns:p188="urn:p188" r:id="rId9"/></p:ext></p:extLst></p:sld>',
      'ppt/slides/_rels/slide1.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" Target="../comments/modernComment_100_1.xml"/></Relationships>`,
      'ppt/comments/modernComment_100_1.xml': '<p188:cmLst xmlns:p188="urn:p188"/>',
    });
    const parts = unzipSync(buildPptx(bytes, [{ start: 4, end: 10, text: 'X' }]));
    expect(parts['ppt/comments/modernComment_100_1.xml']).toBeUndefined();
    expect(decode(parts['ppt/slides/slide1.xml'])).not.toContain('commentRel');
    expect(decode(parts['ppt/slides/_rels/slide1.xml.rels'])).not.toContain('rId9');
  });
});

describe('PowerPoint: parts the text pass does not read', () => {
  const bytes = zipOf({
    '[Content_Types].xml': `<Types xmlns="${CT}">${override('/docProps/core.xml')}${override('/ppt/comments/comment1.xml')}${override('/ppt/commentAuthors.xml')}</Types>`,
    '_rels/.rels': rootRels(),
    'docProps/core.xml': CORE,
    'docProps/app.xml': APP,
    'ppt/presentation.xml': '<p:presentation xmlns:p="x"/>',
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="a1" Type="${OD}/commentAuthors" Target="commentAuthors.xml"/></Relationships>`,
    'ppt/commentAuthors.xml': '<p:cmAuthorLst xmlns:p="x"><p:cmAuthor name="Anders Jensen"/></p:cmAuthorLst>',
    'ppt/slides/slide1.xml': `<p:sld xmlns:p="x" xmlns:a="${A}"><a:p><a:r><a:t>Hej Mikkel</a:t></a:r></a:p></p:sld>`,
    'ppt/slides/_rels/slide1.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="m1" Type="${OD}/comments" Target="../comments/comment1.xml"/></Relationships>`,
    'ppt/comments/comment1.xml': '<p:cmLst xmlns:p="x"><p:cm><p:text>Ring til 20123456</p:text></p:cm></p:cmLst>',
  });

  test('metadata, comments and comment authors are removed', () => {
    const out = buildPptx(bytes, [{ start: 4, end: 10, text: '[PERSON_1]' }]);
    const parts = unzipSync(out);
    expect(Object.keys(parts).filter((n) => /docProps|comment/i.test(n))).toEqual([]);
    expect(decode(parts['ppt/slides/_rels/slide1.xml.rels'])).not.toContain('comment');
    expect(decode(parts['ppt/_rels/presentation.xml.rels'])).not.toContain('comment');
    expect(everything(out)).not.toMatch(/Anders Jensen|20123456/);
    expect(extractPptxText(out)).toBe('Hej [PERSON_1]');
  });
});
