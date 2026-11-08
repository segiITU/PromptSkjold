import { zipSync, type Unzipped } from 'fflate';
import type { Replacement } from '../shared/anonymizer';
import { baseName } from './kinds';
import { hiddenOfficeText, isPrivatePart, relationshipsTo, removeParts, removePrivateParts, withHiddenText } from './ooxml-strip';
import { MAX_OFFICE_BYTES, numberedParts, parseXml, readZipParts, serializeXml } from './ooxml-text';

/** Excel files larger than this are not read. */
export const MAX_XLSX_BYTES = MAX_OFFICE_BYTES;

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHARED_STRINGS = 'xl/sharedStrings.xml';

/** One cell that holds text or a number, and where its text sits in the whole text. */
interface Cell {
  el: Element;
  text: string;
  start: number;
  /** Index into the shared strings when the cell points at one. */
  shared: number | null;
}

interface Workbook {
  parts: Unzipped;
  sheets: Array<{ name: string; doc: Document }>;
  sharedDoc: Document | null;
  sharedStrings: string[];
  cells: Cell[];
  text: string;
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === MAIN && (n as Element).localName === name,
  );
}

/** The text of a string item or inline string: its runs, without phonetic hints. */
function itemText(item: Element): string {
  let out = '';
  for (const t of Array.from(item.getElementsByTagNameNS(MAIN, 't'))) {
    let skip = false;
    for (let p = t.parentNode; p && p !== item; p = p.parentNode) {
      if ((p as Element).localName === 'rPh') skip = true;
    }
    if (!skip) out += t.textContent ?? '';
  }
  return out;
}

function readSharedStrings(doc: Document): string[] {
  const root = doc.documentElement;
  return children(root, 'si').map(itemText);
}

function cellText(c: Element, shared: string[]): { text: string; shared: number | null } {
  const type = c.getAttribute('t');
  const v = children(c, 'v')[0]?.textContent ?? '';
  if (type === 's') {
    const index = Number(v);
    return { text: shared[index] ?? '', shared: Number.isInteger(index) ? index : null };
  }
  if (type === 'inlineStr') {
    const is = children(c, 'is')[0];
    return { text: is ? itemText(is) : '', shared: null };
  }
  if (type === 'b' || type === 'e') return { text: '', shared: null };
  // Plain numbers and cached formula text.
  return { text: v, shared: null };
}

function load(bytes: Uint8Array): Workbook {
  const parts = readZipParts(bytes);
  if (!parts['xl/workbook.xml']) throw new Error('Not an Excel file (xl/workbook.xml is missing).');

  const sharedDoc = parts[SHARED_STRINGS] ? parseXml(parts[SHARED_STRINGS], 'Excel file') : null;
  const sharedStrings = sharedDoc ? readSharedStrings(sharedDoc) : [];

  const sheets: Workbook['sheets'] = [];
  const cells: Cell[] = [];
  const lines: string[] = [];
  let offset = 0;

  for (const name of numberedParts(parts, /^xl\/worksheets\/sheet\d+\.xml$/)) {
    const doc = parseXml(parts[name], 'Excel file');
    sheets.push({ name, doc });
    for (const row of Array.from(doc.getElementsByTagNameNS(MAIN, 'row'))) {
      const rowTexts: string[] = [];
      let column = 0;
      for (const c of children(row, 'c')) {
        const { text, shared } = cellText(c, sharedStrings);
        if (text === '') continue;
        // A cell is one line of its row's text, separated by tabs.
        const start = offset + (rowTexts.length > 0 ? rowTexts.join('\t').length + 1 : 0);
        cells.push({ el: c, text, start, shared });
        rowTexts.push(text);
        column++;
      }
      if (column === 0) continue;
      const line = rowTexts.join('\t');
      lines.push(line);
      offset += line.length + 1; // rows are joined by a newline
    }
  }
  return { parts, sheets, sharedDoc, sharedStrings, cells, text: lines.join('\n') };
}

/**
 * The text of every sheet, one row per line and cells separated by tabs.
 * Numbers are included (phone numbers and salaries are often stored as
 * numbers). Headers, charts and sheet names are not included.
 */
export function extractXlsxText(bytes: Uint8Array): string {
  const workbook = load(bytes);
  return withHiddenText(workbook.text, hiddenOfficeText(workbook.parts));
}

/** What a cell's text becomes once the replacements that touch it are applied. */
function replacedText(cell: Cell, sorted: Replacement[]): string {
  const end = cell.start + cell.text.length;
  let out = '';
  let pos = cell.start;
  for (const r of sorted) {
    if (r.end <= cell.start || r.start >= end) continue;
    const from = Math.max(r.start, cell.start);
    out += cell.text.slice(pos - cell.start, from - cell.start);
    // The replacement goes into the cell where the item starts; later cells just lose their part.
    if (r.start >= cell.start) out += r.text;
    pos = Math.min(r.end, end);
  }
  return out + cell.text.slice(pos - cell.start);
}

function setCellText(doc: Document, c: Element, text: string): void {
  for (const f of children(c, 'f')) c.removeChild(f);
  for (const v of children(c, 'v')) c.removeChild(v);
  for (const is of children(c, 'is')) c.removeChild(is);
  c.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(MAIN, 'is');
  const t = doc.createElementNS(MAIN, 't');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t.textContent = text;
  is.appendChild(t);
  c.appendChild(is);
}

/**
 * A copy of the workbook with the replacements applied. Changed cells become
 * inline text, and a shared string that no cell uses any more is emptied, so
 * the original value does not stay behind in the file. `replacements` are
 * positions in the text returned by {@link extractXlsxText}.
 */
export function buildXlsx(bytes: Uint8Array, replacements: Replacement[]): Uint8Array {
  const workbook = load(bytes);
  const sorted = [...replacements].sort((a, b) => a.start - b.start);

  // How many cells point at each shared string, over all sheets.
  const uses = new Map<number, number>();
  for (const sheet of workbook.sheets) {
    for (const c of Array.from(sheet.doc.getElementsByTagNameNS(MAIN, 'c'))) {
      if (c.getAttribute('t') !== 's') continue;
      const index = Number(children(c, 'v')[0]?.textContent);
      if (Number.isInteger(index)) uses.set(index, (uses.get(index) ?? 0) + 1);
    }
  }

  const changedShared = new Set<number>();
  let changed = false;
  for (const cell of workbook.cells) {
    const next = replacedText(cell, sorted);
    if (next === cell.text) continue;
    changed = true;
    if (cell.shared !== null) {
      uses.set(cell.shared, (uses.get(cell.shared) ?? 1) - 1);
      changedShared.add(cell.shared);
    }
    setCellText(cell.el.ownerDocument, cell.el, next);
  }

  if (changed) {
    // Freeze all remaining formulas at their cached values. A shared-formula
    // master can otherwise retain a selected literal after a dependent cell is
    // replaced, and recalculation can recreate the original. This also avoids
    // leaving shared/array formula groups pointing to a removed master.
    for (const sheet of workbook.sheets) {
      for (const formula of Array.from(sheet.doc.getElementsByTagNameNS(MAIN, 'f'))) {
        formula.parentNode?.removeChild(formula);
      }
    }
    delete workbook.parts['xl/calcChain.xml'];
    removeCalcChainReferences(workbook.parts);
  }

  if (workbook.sharedDoc && changedShared.size > 0) {
    const items = children(workbook.sharedDoc.documentElement, 'si');
    for (const index of changedShared) {
      if ((uses.get(index) ?? 0) > 0 || !items[index]) continue;
      while (items[index].firstChild) items[index].removeChild(items[index].firstChild);
      items[index].appendChild(workbook.sharedDoc.createElementNS(MAIN, 't'));
    }
    workbook.parts[SHARED_STRINGS] = serializeXml(workbook.sharedDoc);
  }

  dropCommentDrawings(workbook);
  for (const sheet of workbook.sheets) workbook.parts[sheet.name] = serializeXml(sheet.doc);
  removePrivateParts(workbook.parts);
  return zipSync(workbook.parts);
}

/**
 * Comments are removed from the copy, and so is the drawing that only draws
 * their boxes; a sheet pointing at a part that is gone would not open.
 */
function dropCommentDrawings(workbook: Workbook): void {
  for (const sheet of workbook.sheets) {
    if (relationshipsTo(workbook.parts, sheet.name, (target) => isPrivatePart(target)).length === 0) continue;
    // Form controls share the comments' drawing; removing it would leave them without their shapes.
    if (sheet.doc.getElementsByTagNameNS(MAIN, 'controls').length > 0) continue;
    // Only the drawing a `legacyDrawing` points at; a header/footer picture (`legacyDrawingHF`) is a different part.
    const legacy = Array.from(sheet.doc.getElementsByTagNameNS(MAIN, 'legacyDrawing'));
    const ids = new Set(legacy.map((el) => el.getAttributeNS(OFFICE_REL, 'id')));
    const drawings = relationshipsTo(workbook.parts, sheet.name, (_target, type) => type.endsWith('/vmlDrawing'))
      .filter((d) => ids.has(d.id));
    for (const el of legacy) {
      if (drawings.some((d) => d.id === el.getAttributeNS(OFFICE_REL, 'id'))) el.parentNode?.removeChild(el);
    }
    removeParts(workbook.parts, drawings.map((d) => d.target));
  }
}

function removeCalcChainReferences(parts: Unzipped): void {
  for (const name of ['xl/_rels/workbook.xml.rels', '[Content_Types].xml']) {
    if (!parts[name]) continue;
    const doc = parseXml(parts[name], 'Excel file');
    for (const el of Array.from(doc.documentElement.children)) {
      if (el.getAttribute('Type')?.endsWith('/calcChain') || el.getAttribute('PartName') === '/xl/calcChain.xml') {
        el.parentNode?.removeChild(el);
      }
    }
    parts[name] = serializeXml(doc);
  }
}

export function xlsxFileName(name: string): string {
  return `${baseName(name)}-anonymised.xlsx`;
}
