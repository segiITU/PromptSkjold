import { zipSync, type Unzipped } from 'fflate';
import type { Replacement } from '../shared/anonymizer';
import { baseName } from './kinds';
import { hiddenOfficeText, removePrivateParts, withHiddenText } from './ooxml-strip';
import {
  MAX_OFFICE_BYTES,
  applyToTextParts,
  loadTextParts,
  numberedParts,
  readZipParts,
  serializeXml,
  textOfParts,
  type TextFlavour,
  type TextPart,
} from './ooxml-text';

/** Word files larger than this are not read. */
export const MAX_DOCX_BYTES = MAX_OFFICE_BYTES;

const MAIN_PART = 'word/document.xml';
/** Parts with their own text, read after the body. */
const EXTRA_PARTS = [/^word\/header\d+\.xml$/, /^word\/footer\d+\.xml$/, /^word\/footnotes\.xml$/, /^word\/endnotes\.xml$/];
/** Text of tracked deletions, which the text pass skips and which would otherwise stay in the copy. */
const DELETED_TEXT = new Set(['delText', 'delInstrText']);
/** Marks that tie the body to the comments, which are removed from the copy. */
const COMMENT_ANCHORS = new Set(['commentRangeStart', 'commentRangeEnd', 'commentReference']);
const WORD: TextFlavour = {
  ns: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  paragraph: 'p',
  text: 't',
  tab: 'tab',
  br: 'br',
};

/** The body first, then the headers, footers, footnotes and endnotes (numbered ones in number order). */
function textPartNames(parts: Unzipped): string[] {
  return [MAIN_PART, ...EXTRA_PARTS.flatMap((pattern) => numberedParts(parts, pattern))];
}

function load(bytes: Uint8Array) {
  const parts = readZipParts(bytes);
  if (!parts[MAIN_PART]) throw new Error('Not a Word document (word/document.xml is missing).');
  return { parts, loaded: loadTextParts(parts, textPartNames(parts), WORD, 'Word document') };
}

/** Remove what the text pass cannot replace: deleted text, comment anchors and the names on tracked changes. */
function cleanWordParts(loaded: TextPart[]): void {
  for (const { doc } of loaded) {
    for (const el of Array.from(doc.getElementsByTagNameNS(WORD.ns, '*'))) {
      if (DELETED_TEXT.has(el.localName) || COMMENT_ANCHORS.has(el.localName)) {
        el.parentNode?.removeChild(el);
      } else if (el.hasAttributeNS(WORD.ns, 'author')) {
        el.setAttributeNS(WORD.ns, 'w:author', '');
        el.removeAttributeNS(WORD.ns, 'initials');
      }
    }
  }
}

/** Deleted text and the names on tracked changes, which the copy drops; checked after the body text. */
function hiddenWordText(loaded: TextPart[]): string {
  const lines = new Set<string>();
  for (const { doc } of loaded) {
    for (const el of Array.from(doc.getElementsByTagNameNS(WORD.ns, '*'))) {
      if (DELETED_TEXT.has(el.localName)) lines.add((el.textContent ?? '').trim());
      else if (el.hasAttributeNS(WORD.ns, 'author')) lines.add((el.getAttributeNS(WORD.ns, 'author') ?? '').trim());
    }
  }
  lines.delete('');
  return [...lines].join('\n');
}

/** The text of the body, headers, footers, footnotes and endnotes, one paragraph per line, then the author, comments and deleted text. */
export function extractDocxText(bytes: Uint8Array): string {
  const { parts, loaded } = load(bytes);
  return withHiddenText(textOfParts(loaded), [hiddenOfficeText(parts), hiddenWordText(loaded)].filter(Boolean).join('\n'));
}

/**
 * A copy of the document with the replacements applied inside its runs, so
 * fonts, tables and layout stay as they were. `replacements` are positions in
 * the text returned by {@link extractDocxText}.
 */
export function buildDocx(bytes: Uint8Array, replacements: Replacement[]): Uint8Array {
  const { parts, loaded } = load(bytes);
  applyToTextParts(loaded, replacements);
  cleanWordParts(loaded);
  for (const part of loaded) parts[part.name] = serializeXml(part.doc);
  removePrivateParts(parts);
  return zipSync(parts);
}

export function docxFileName(name: string): string {
  return `${baseName(name)}-anonymised.docx`;
}
