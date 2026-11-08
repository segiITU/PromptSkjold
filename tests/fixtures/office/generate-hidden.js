#!/usr/bin/env node
/**
 * Generates SYNTHETIC Word, Excel and PowerPoint files whose personal data sits only in the parts the main
 * text pass does not read: document properties (author, company), comments, tracked deletions, headers and
 * footers. For trying the red-team fixes on a live chat site. Every name, number and address is made up.
 *
 *   node tests/fixtures/office/generate-hidden.js     writes skjult-*.docx / .xlsx / .pptx here
 *
 * The body of each file is clean on purpose: it should only be flagged because of the hidden text. The files are
 * minimal hand-built OOXML packages and have not been opened in Microsoft Office.
 */
const fs = require('fs');
const path = require('path');
const { strToU8, zipSync } = require('fflate');

const MTIME = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CORE =
  XML +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  '<dc:creator>Freja Syntetisk</dc:creator><cp:lastModifiedBy>Mads Testesen</cp:lastModifiedBy></cp:coreProperties>';
const APP = XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Company>Syntetisk Firma ApS</Company></Properties>';
const rels = (...items) => `${XML}<Relationships xmlns="${REL}">${items.join('')}</Relationships>`;
const rel = (id, type, target) => `<Relationship Id="${id}" Type="${OD}/${type}" Target="${target}"/>`;
const coreRels = (main) =>
  rels(
    rel('rId1', 'officeDocument', main),
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    rel('rId3', 'extended-properties', 'docProps/app.xml'),
  );
const ov = (part, type) => `<Override PartName="${part}" ContentType="${type}"/>`;

function write(name, files) {
  const entries = {};
  for (const key of Object.keys(files).sort()) entries[key] = [strToU8(files[key]), { mtime: MTIME }];
  fs.writeFileSync(path.join(__dirname, name), Buffer.from(zipSync(entries)));
  console.log('wrote', name);
}

// ---- Word: clean body; author, company, a comment, a tracked deletion, a header and a footer hold the data.
write('skjult-word.docx', {
  '[Content_Types].xml':
    `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    ov('/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') +
    ov('/word/comments.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml') +
    ov('/word/header1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml') +
    ov('/word/footer1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml') +
    ov('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    ov('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml') +
    '</Types>',
  '_rels/.rels': coreRels('word/document.xml'),
  'docProps/core.xml': CORE,
  'docProps/app.xml': APP,
  'word/_rels/document.xml.rels': rels(rel('rId1', 'comments', 'comments.xml'), rel('rId2', 'header', 'header1.xml'), rel('rId3', 'footer', 'footer1.xml')),
  'word/document.xml':
    `${XML}<w:document xmlns:w="${W}" xmlns:r="${OD}"><w:body>` +
    '<w:p><w:r><w:t>Syntetisk testdata: skjult tekst. Selve teksten her er harmløs.</w:t></w:r></w:p>' +
    '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Et afsnit med en kommentar.</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>' +
    '<w:del w:id="1" w:author="Freja Syntetisk" w:date="2026-01-01T12:00:00Z"><w:r><w:delText>Slettet: Karen Sletteby, tlf. +45 50930610</w:delText></w:r></w:del></w:p>' +
    '<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/></w:sectPr></w:body></w:document>',
  'word/comments.xml':
    `${XML}<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Mads Testesen" w:initials="MT"><w:p><w:r><w:t>Ring til Lars Kommentarsen på +45 50930611 eller lars@syntetisk-firma.test</w:t></w:r></w:p></w:comment></w:comments>`,
  'word/header1.xml': `${XML}<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Fortroligt – Signe Sidehoved, 010190-1239</w:t></w:r></w:p></w:hdr>`,
  'word/footer1.xml': `${XML}<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>Testvej 12, 8000 Aarhus C</w:t></w:r></w:p></w:ftr>`,
});

// ---- Excel: clean cell; author, company and a cell note hold the data.
write('skjult-excel.xlsx', {
  '[Content_Types].xml':
    `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    ov('/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') +
    ov('/xl/worksheets/sheet1.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml') +
    ov('/xl/comments1.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml') +
    ov('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    ov('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml') +
    '</Types>',
  '_rels/.rels': coreRels('xl/workbook.xml'),
  'docProps/core.xml': CORE,
  'docProps/app.xml': APP,
  'xl/workbook.xml': `${XML}<workbook xmlns="${S}" xmlns:r="${OD}"><sheets><sheet name="Ark1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': rels(rel('rId1', 'worksheet', 'worksheets/sheet1.xml')),
  'xl/worksheets/sheet1.xml':
    `${XML}<worksheet xmlns="${S}" xmlns:r="${OD}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Syntetisk testdata: skjult tekst</t></is></c></row></sheetData></worksheet>`,
  'xl/worksheets/_rels/sheet1.xml.rels': rels(rel('rId1', 'comments', '../comments1.xml')),
  'xl/comments1.xml':
    `${XML}<comments xmlns="${S}"><authors><author>Mads Testesen</author></authors><commentList><comment ref="A1" authorId="0"><text><r><t>Kunde: Nina Noteby, konto Reg. 5678 konto 9876543210</t></r></text></comment></commentList></comments>`,
});

// ---- PowerPoint: clean slide; author, company, a comment and its author hold the data.
write('skjult-powerpoint.pptx', {
  '[Content_Types].xml':
    `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    ov('/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml') +
    ov('/ppt/slides/slide1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml') +
    ov('/ppt/commentAuthors.xml', 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml') +
    ov('/ppt/comments/comment1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml') +
    ov('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    ov('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml') +
    '</Types>',
  '_rels/.rels': coreRels('ppt/presentation.xml'),
  'docProps/core.xml': CORE,
  'docProps/app.xml': APP,
  'ppt/presentation.xml': `${XML}<p:presentation xmlns:p="${P}" xmlns:r="${OD}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': rels(rel('rId1', 'slide', 'slides/slide1.xml'), rel('rId2', 'commentAuthors', 'commentAuthors.xml')),
  'ppt/slides/slide1.xml':
    `${XML}<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Syntetisk testdata: skjult tekst. Selve sliden er harmløs.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide1.xml.rels': rels(rel('rId1', 'comments', '../comments/comment1.xml')),
  'ppt/commentAuthors.xml': `${XML}<p:cmAuthorLst xmlns:p="${P}"><p:cmAuthor id="0" name="Mads Testesen" initials="MT" lastIdx="1" clrIdx="0"/></p:cmAuthorLst>`,
  'ppt/comments/comment1.xml':
    `${XML}<p:cmLst xmlns:p="${P}"><p:cm authorId="0" dt="2026-01-01T12:00:00.000" idx="1"><p:pos x="10" y="10"/><p:text>Send til Poul Slidesen, poul@syntetisk-firma.test, +45 50930612</p:text></p:cm></p:cmLst>`,
});
