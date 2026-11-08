import { unzipSync, type Unzipped } from 'fflate';
import type { Replacement } from '../shared/anonymizer';

/** Office files larger than this are not read. */
export const MAX_OFFICE_BYTES = 15 * 1024 * 1024;
/** A part that unpacks to more than this is refused (zip bombs). */
export const MAX_PART_BYTES = 20 * 1024 * 1024;
/** The unpacking and parsing run on the chat page's own thread, so the whole archive is kept small. */
export const MAX_EXPANDED_OFFICE_BYTES = 40 * 1024 * 1024;
export const MAX_OFFICE_PARTS = 10_000;

export function readZipParts(bytes: Uint8Array): Unzipped {
  if (bytes.length > MAX_OFFICE_BYTES) throw new Error('The Office file is too large to check.');
  let total = 0;
  let count = 0;
  const names = new Set<string>();
  // First inspect the complete directory without inflating anything. Filtering
  // out an oversized worksheet would make a partial scan look complete, and
  // checking totals while inflating would allocate earlier parts unnecessarily.
  unzipSync(bytes, { filter: (entry) => {
    count += 1;
    total += entry.originalSize;
    if (count > MAX_OFFICE_PARTS || entry.originalSize > MAX_PART_BYTES || total > MAX_EXPANDED_OFFICE_BYTES) {
      throw new Error('The Office file expands beyond the safe checking limits; no parts were checked.');
    }
    if (names.has(entry.name)) throw new Error('The Office file contains duplicate parts and cannot be checked safely.');
    names.add(entry.name);
    return false;
  } });
  return unzipSync(bytes);
}

export function parseXml(bytes: Uint8Array, label: string): Document {
  const xml = new TextDecoder('utf-8').decode(bytes);
  // Office files never need a document type or entities; they are the way to build an XML bomb
  // (entities that expand into each other), and a parser on the page's thread would have to expand them.
  if (/<!(?:DOCTYPE|ENTITY)/.test(xml)) throw new Error(`The ${label} contains a document type declaration and is not read.`);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error(`The ${label} could not be parsed.`);
  return doc;
}

export function serializeXml(doc: Document) {
  return new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
}

/** Names of the XML elements that make up text in one Office format. */
export interface TextFlavour {
  ns: string;
  paragraph: string;
  text: string;
  /** Element that stands for a tab, if the format has one. */
  tab?: string;
  /** Element that stands for a line break. */
  br: string;
}

/** A piece of a paragraph: editable text from one run, or a fixed tab/line break. */
interface Atom {
  node: Element | null;
  text: string;
}

interface Paragraph {
  atoms: Atom[];
  /** Offset of this paragraph's first character in the whole text. */
  base: number;
  length: number;
}

export interface TextPart {
  name: string;
  doc: Document;
  paragraphs: Paragraph[];
}

/** Nearest enclosing paragraph, so text inside a text box is not counted twice. */
function owner(node: Element, flavour: TextFlavour): Element | null {
  for (let p = node.parentNode; p; p = p.parentNode) {
    if (p.nodeType === 1 && (p as Element).namespaceURI === flavour.ns && (p as Element).localName === flavour.paragraph) {
      return p as Element;
    }
  }
  return null;
}

function collect(doc: Document, flavour: TextFlavour, startBase: number): { paragraphs: Paragraph[]; end: number } {
  const paragraphs: Paragraph[] = [];
  const all = Array.from(doc.getElementsByTagNameNS(flavour.ns, flavour.paragraph));
  const atomsByParagraph = new Map<Element, Atom[]>(all.map((p) => [p, []]));
  // Walk every text, tab and break node in document order and file it under its paragraph.
  for (const node of Array.from(doc.getElementsByTagNameNS(flavour.ns, '*'))) {
    const kind = node.localName;
    if (kind !== flavour.text && kind !== flavour.tab && kind !== flavour.br) continue;
    const p = owner(node, flavour);
    if (!p) continue;
    const atoms = atomsByParagraph.get(p);
    if (!atoms) continue;
    if (kind === flavour.text) atoms.push({ node, text: node.textContent ?? '' });
    else atoms.push({ node: null, text: kind === flavour.tab ? '\t' : '\n' });
  }
  let base = startBase;
  for (const p of all) {
    const atoms = atomsByParagraph.get(p) ?? [];
    const length = atoms.reduce((n, a) => n + a.text.length, 0);
    paragraphs.push({ atoms, base, length });
    base += length + 1; // paragraphs are joined by a newline
  }
  return { paragraphs, end: base };
}

/** Parse the named parts and lay their paragraphs out one after another. */
export function loadTextParts(parts: Unzipped, names: string[], flavour: TextFlavour, label: string): TextPart[] {
  const loaded: TextPart[] = [];
  let base = 0;
  for (const name of names) {
    const bytes = parts[name];
    if (!bytes) continue;
    const doc = parseXml(bytes, label);
    const { paragraphs, end } = collect(doc, flavour, base);
    loaded.push({ name, doc, paragraphs });
    base = end;
  }
  return loaded;
}

/** The text of the parts, one paragraph per line. */
export function textOfParts(loaded: TextPart[]): string {
  return loaded
    .flatMap((part) => part.paragraphs)
    .map((p) => p.atoms.map((a) => a.text).join(''))
    .join('\n');
}

/**
 * Apply replacements inside the runs, so fonts, tables and layout stay as they
 * were. `replacements` are positions in the text returned by {@link textOfParts}.
 */
export function applyToTextParts(loaded: TextPart[], replacements: Replacement[]): void {
  const sorted = [...replacements].sort((a, b) => a.start - b.start);

  for (const part of loaded) {
    for (const paragraph of part.paragraphs) {
      const end = paragraph.base + paragraph.length;
      const inside = sorted.filter((r) => r.end > paragraph.base && r.start < end);
      if (inside.length === 0) continue;

      let atomStart = paragraph.base;
      for (const atom of paragraph.atoms) {
        const atomEnd = atomStart + atom.text.length;
        if (atom.node) {
          let out = '';
          let pos = atomStart;
          for (const r of inside) {
            if (r.end <= atomStart || r.start >= atomEnd) continue;
            const from = Math.max(r.start, atomStart);
            out += atom.text.slice(pos - atomStart, from - atomStart);
            // The replacement goes into the run where the item starts; later runs just lose their part.
            if (r.start >= atomStart) out += r.text;
            pos = Math.min(r.end, atomEnd);
          }
          out += atom.text.slice(pos - atomStart);
          if (out !== atom.text) {
            atom.node.textContent = out;
            atom.node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
          }
        }
        atomStart = atomEnd;
      }
    }
  }
}

/** Part names matching a pattern, ordered by the number in the name (slide2 before slide10). */
export function numberedParts(parts: Unzipped, pattern: RegExp): string[] {
  return Object.keys(parts)
    .filter((name) => pattern.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0));
}
