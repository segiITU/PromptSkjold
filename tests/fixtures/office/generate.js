#!/usr/bin/env node
/**
 * Generates the SYNTHETIC Excel and PowerPoint example files in this folder. Deterministic (fixed timestamps,
 * seeded noise), no network, no dependencies beyond fflate (already a dependency of the extension).
 *
 *   node tests/fixtures/office/generate.js            writes syntetisk-testdata.xlsx and syntetisk-testdata.pptx here
 *   node tests/fixtures/office/generate.js --big DIR  also writes syntetisk-stor.pptx (about 8 MB, with images) into DIR
 *
 * ALL data is made up: names, e-mail addresses (syntetisk-firma.test / ermias.ai), phone numbers, CPR numbers, IBAN, address
 * and IP are fictional. Every file says "Syntetisk testdata" in its first cell / slide. The files are minimal OOXML
 * packages built by hand, meant for the extension's text reading and replacing, not as polished Office documents.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { strToU8, zipSync } = require('fflate');

const OUT = __dirname;
const MTIME = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Deterministic zip: sorted entries, fixed mtime. */
function zip(files) {
  const entries = {};
  for (const name of Object.keys(files).sort()) {
    const v = files[name];
    entries[name] = [typeof v === 'string' ? strToU8(v) : v, { mtime: MTIME, level: typeof v === 'string' ? 6 : 0 }];
  }
  return Buffer.from(zipSync(entries));
}

// ---------------------------------------------------------------- the made-up data
const PEOPLE = [
  { name: 'Anna Testesen', email: 'anna.testesen@syntetisk-firma.test', phone: '+45 28 71 40 93', cpr: '111111-1111', address: 'Testvej 12, 2200 København N', born: '12-04-1985' },
  { name: 'Bjarne Madsen', email: 'bjarne.madsen@syntetisk-firma.test', phone: '+45 31 22 45 67', cpr: '150385-4321', address: 'Prøvegade 7, 8000 Aarhus C', born: '15-03-1985' },
  { name: 'Camilla Bjerregaard', email: 'kontakt@ermias.ai', phone: 'tlf. 61 23 45 67', cpr: '070790-1234', address: 'Birkeallé 3, 5000 Odense C', born: '07-07-1990' },
];
const IBAN = 'DK50 0040 0440 1162 43';
const ACCOUNT = 'Reg. 5678 konto 9876543210';
const IP = '192.168.10.24';
const TITLE = 'Syntetisk testdata – ingen rigtige personoplysninger';

// ---------------------------------------------------------------- xlsx
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function buildXlsx() {
  const shared = [];
  const si = (text) => {
    let i = shared.indexOf(text);
    if (i < 0) {
      shared.push(text);
      i = shared.length - 1;
    }
    return i;
  };
  const sc = (ref, text) => `<c r="${ref}" t="s"><v>${si(text)}</v></c>`;
  const inl = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
  const num = (ref, n) => `<c r="${ref}"><v>${n}</v></c>`;

  // Sheet 1: contacts (merged title cell, formula cell with a cached text result, a note column)
  const rows1 = [];
  rows1.push(`<row r="1">${sc('A1', TITLE)}</row>`);
  rows1.push(`<row r="2">${['Navn', 'E-mail', 'Telefon', 'CPR', 'Adresse', 'Note'].map((h, i) => sc(String.fromCharCode(65 + i) + '2', h)).join('')}</row>`);
  PEOPLE.forEach((p, i) => {
    const r = i + 3;
    const note = i === 0 ? 'Ring efter kl. 16. Ordrenummer 12345678.' : i === 1 ? 'Fødselsdato ' + p.born : 'Bruger kun e-mail';
    rows1.push(`<row r="${r}">${sc('A' + r, p.name)}${sc('B' + r, p.email)}${sc('C' + r, p.phone)}${inl('D' + r, p.cpr)}${sc('E' + r, p.address)}${inl('F' + r, note)}</row>`);
  });
  // formula cell: the cached result repeats an e-mail address
  rows1.push(`<row r="7">${sc('A7', 'Samlet kontakt')}<c r="B7" t="str"><f>B3&amp;" / "&amp;B4</f><v>${esc(PEOPLE[0].email + ' / ' + PEOPLE[1].email)}</v></c></row>`);
  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S}"><sheetData>${rows1.join('')}</sheetData><mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells></worksheet>`;

  // Sheet 2: finance
  const rows2 = [
    `<row r="1">${sc('A1', 'Økonomi (syntetisk)')}</row>`,
    `<row r="2">${sc('A2', 'IBAN')}${sc('B2', IBAN)}</row>`,
    `<row r="3">${sc('A3', 'Bankkonto')}${sc('B3', ACCOUNT)}</row>`,
    `<row r="4">${sc('A4', 'Server (IP)')}${sc('B4', IP)}</row>`,
    `<row r="5">${sc('A5', 'Budget 2026')}${num('B5', 125000)}${num('C5', 98250.5)}</row>`,
    `<row r="6">${sc('A6', 'Ordrenummer')}${num('B6', 12345678)}</row>`,
  ];
  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S}"><sheetData>${rows2.join('')}</sheetData></worksheet>`;

  // Sheet 3: hidden
  const rows3 = [
    `<row r="1">${sc('A1', 'Skjult ark (syntetisk)')}</row>`,
    `<row r="2">${sc('A2', PEOPLE[2].name)}${inl('B2', '070790-1234')}${sc('C2', '+45 40 12 34 56')}</row>`,
  ];
  const sheet3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S}"><sheetData>${rows3.join('')}</sheetData></worksheet>`;

  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${S}" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`;
  return zip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Kontakter" sheetId="1" r:id="rId1"/><sheet name="Økonomi" sheetId="2" r:id="rId2"/><sheet name="Skjult" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${R}/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="${R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/sharedStrings.xml': sst,
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet2,
    'xl/worksheets/sheet3.xml': sheet3,
  });
}

// ---------------------------------------------------------------- pptx
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS = `xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"`;

const run = (t) => `<a:r><a:rPr lang="da-DK"/><a:t>${esc(t)}</a:t></a:r>`;
const para = (t) => `<a:p>${run(t)}</a:p>`;
let shapeId = 2;
const box = (name, x, y, w, h, lines) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId++}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map(para).join('')}</p:txBody></p:sp>`;
const table = (rows) =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId++}" name="Tabel"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="600000" y="2600000"/><a:ext cx="8000000" cy="1200000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${rows[0].map(() => '<a:gridCol w="2000000"/>').join('')}</a:tblGrid>${rows.map((r) => `<a:tr h="400000">${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(c)}</a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const pic = (rid, name) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId++}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="600000" y="3900000"/><a:ext cx="1800000" cy="1800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

function slideXml(shapes) {
  shapeId = 2;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes()}</p:spTree></p:cSld></p:sld>`;
}
const notesXml = (lines) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Noter"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map(para).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;

function buildPptx(images = []) {
  const slides = [
    slideXml(() => box('Titel', 600000, 400000, 8000000, 800000, [TITLE]) + box('Tekstboks', 600000, 1400000, 8000000, 1400000, [`Kontaktperson: ${PEOPLE[0].name}`, `E-mail: ${PEOPLE[0].email}`, 'Dagsorden: budget og planlægning'])),
    slideXml(() => box('Kontakt', 600000, 400000, 8000000, 700000, ['Kontaktoplysninger (syntetiske)']) + table([['Navn', 'Telefon', 'CPR', 'E-mail'], [PEOPLE[1].name, PEOPLE[1].phone, PEOPLE[1].cpr, PEOPLE[1].email], [PEOPLE[2].name, PEOPLE[2].phone, PEOPLE[2].cpr, PEOPLE[2].email]])),
    slideXml(() => box('Budget', 600000, 400000, 8000000, 700000, ['Budget 2026 og tidsplan']) + box('Tal', 600000, 1400000, 8000000, 1400000, ['Omsætning: 125.000 kr. Ordrenummer 12345678.', `Server: ${IP}`, `Fødselsdato: ${PEOPLE[0].born}`])),
    slideXml(() => box('Betaling', 600000, 400000, 8000000, 700000, ['Betaling']) + box('Bank', 600000, 1400000, 8000000, 1400000, [`IBAN: ${IBAN}`, ACCOUNT, `Adresse: ${PEOPLE[0].address}`]) + images.map((_, i) => pic(`rId${i + 1}`, `Billede ${i + 1}`)).join('')),
  ];
  const notes = {
    1: [`Husk: ring til ${PEOPLE[0].name} på ${PEOPLE[0].phone}.`, `CPR til tjek: ${PEOPLE[0].cpr}`],
    3: ['Noter: intet følsomt her, bare tal.'],
  };
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}${Object.keys(notes).map((n) => `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  slides.forEach((xml, i) => {
    const n = i + 1;
    files[`ppt/slides/slide${n}.xml`] = xml;
    let rels = '';
    if (notes[n]) rels += `<Relationship Id="rIdN" Type="${R}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`;
    if (n === 4) images.forEach((_, k) => (rels += `<Relationship Id="rId${k + 1}" Type="${R}/image" Target="../media/image${k + 1}.png"/>`));
    if (rels) files[`ppt/slides/_rels/slide${n}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
  });
  for (const [n, lines] of Object.entries(notes)) files[`ppt/notesSlides/notesSlide${n}.xml`] = notesXml(lines);
  images.forEach((png, i) => (files[`ppt/media/image${i + 1}.png`] = png));
  return zip(files);
}

// ---------------------------------------------------------------- deterministic noise PNGs (for the big variant)
function noisePng(size, seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) & 255;
  };
  const row = size * 3 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size * 3; x++) raw[y * row + 1 + x] = rnd();
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- write
fs.writeFileSync(path.join(OUT, 'syntetisk-testdata.xlsx'), buildXlsx());
fs.writeFileSync(path.join(OUT, 'syntetisk-testdata.pptx'), buildPptx());
console.log('wrote syntetisk-testdata.xlsx and syntetisk-testdata.pptx in', OUT);
const bigAt = process.argv.indexOf('--big');
if (bigAt > 0) {
  const dir = path.resolve(process.argv[bigAt + 1] || '.');
  fs.mkdirSync(dir, { recursive: true });
  const images = Array.from({ length: 8 }, (_, i) => noisePng(600, 1000 + i));
  fs.writeFileSync(path.join(dir, 'syntetisk-stor.pptx'), buildPptx(images));
  console.log('wrote syntetisk-stor.pptx in', dir, `(${(fs.statSync(path.join(dir, 'syntetisk-stor.pptx')).size / 1048576).toFixed(1)} MB)`);
}
