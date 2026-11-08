import { unzipSync, type Unzipped } from 'fflate';
import { parseXml, serializeXml } from './ooxml-text';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

/**
 * Parts that hold who wrote the file and what reviewers said about it. The text
 * pass never reads them, so a rebuilt copy leaves them out instead of carrying
 * the original names along: document properties (author, last modified by,
 * company), and the comment parts of Word, Excel and PowerPoint.
 */
const PRIVATE_PARTS = [
  /^docProps\//,
  /^word\/(comments\w*|people)\.xml$/,
  /^xl\/(comments\d*\.xml$|threadedComments\/|persons\/)/,
  /^ppt\/(comments\/|commentAuthors\.xml$|authors\.xml$)/,
];

export function isPrivatePart(name: string): boolean {
  return PRIVATE_PARTS.some((pattern) => pattern.test(name));
}

/** Where a relationship target points, as a part name ("../comments1.xml" in xl/worksheets/_rels/ -> "xl/comments1.xml"). */
function resolveTarget(relsName: string, target: string): string {
  const segments = target.startsWith('/') ? [] : relsName.replace(/(?:^|\/)_rels\/[^/]*$/, '').split('/').filter(Boolean);
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment !== '.' && segment !== '') segments.push(segment);
  }
  return segments.join('/');
}

function relsPartOf(name: string): string {
  const slash = name.lastIndexOf('/');
  return `${name.slice(0, slash + 1)}_rels/${name.slice(slash + 1)}.rels`;
}

/** The relationships of a part that point at parts matching `matches`: their ids and resolved targets. */
export function relationshipsTo(
  parts: Unzipped,
  owner: string,
  matches: (target: string, type: string) => boolean,
): Array<{ id: string; target: string }> {
  const relsName = relsPartOf(owner);
  if (!parts[relsName]) return [];
  const doc = parseXml(parts[relsName], 'Office file');
  return Array.from(doc.getElementsByTagNameNS(REL_NS, 'Relationship'))
    .filter((rel) => rel.getAttribute('TargetMode') !== 'External')
    .map((rel) => ({ id: rel.getAttribute('Id') ?? '', target: resolveTarget(relsName, rel.getAttribute('Target') ?? ''), type: rel.getAttribute('Type') ?? '' }))
    .filter((rel) => matches(rel.target, rel.type))
    .map(({ id, target }) => ({ id, target }));
}

/**
 * Delete parts from the package together with everything that pointed at them,
 * so the copy stays a valid file: their own relationship files, the
 * relationships and content-type entries that name them.
 */
export function removeParts(parts: Unzipped, names: Iterable<string>): void {
  const removed = new Set<string>();
  for (const name of names) {
    if (!(name in parts)) continue;
    delete parts[name];
    delete parts[relsPartOf(name)];
    removed.add(name);
  }
  if (removed.size === 0) return;

  for (const name of Object.keys(parts)) {
    if (!name.endsWith('.rels')) continue;
    const doc = parseXml(parts[name], 'Office file');
    let changed = false;
    for (const rel of Array.from(doc.getElementsByTagNameNS(REL_NS, 'Relationship'))) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      if (!removed.has(resolveTarget(name, rel.getAttribute('Target') ?? ''))) continue;
      rel.parentNode?.removeChild(rel);
      changed = true;
    }
    if (changed) parts[name] = serializeXml(doc);
  }

  const typesName = '[Content_Types].xml';
  if (!parts[typesName]) return;
  const types = parseXml(parts[typesName], 'Office file');
  let changed = false;
  for (const override of Array.from(types.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Override'))) {
    if (!removed.has((override.getAttribute('PartName') ?? '').replace(/^\//, ''))) continue;
    override.parentNode?.removeChild(override);
    changed = true;
  }
  if (changed) parts[typesName] = serializeXml(types);
}

/** Remove the document properties and comment parts from the package. */
export function removePrivateParts(parts: Unzipped): void {
  removeParts(parts, Object.keys(parts).filter(isPrivatePart));
}

/** Leaf elements of the document properties that can hold a person or a company; dates and counts are skipped. */
const PROPERTY_ELEMENTS = new Set([
  'creator', 'lastModifiedBy', 'title', 'subject', 'keywords', 'description', 'category', 'Company', 'Manager',
]);
/** Attributes that carry the name of whoever wrote a comment or a tracked change. */
const AUTHOR_ATTRIBUTES = new Set(['author', 'initials', 'name']);

/**
 * The text of the parts that a rebuilt copy leaves out (document properties and comments): who wrote the
 * file, the company, what reviewers said. It is appended after the text that is replaced in place, so it is
 * checked and shown in the review, and the copy drops it.
 */
export function hiddenOfficeText(parts: Unzipped): string {
  const lines = new Set<string>();
  const add = (text: string | null | undefined) => {
    const value = (text ?? '').trim();
    if (value) lines.add(value);
  };
  for (const name of Object.keys(parts)) {
    if (!isPrivatePart(name) || !name.endsWith('.xml')) continue;
    let doc: Document;
    try {
      doc = parseXml(parts[name], 'Office file');
    } catch {
      continue; // a part that cannot be read is dropped from the copy anyway
    }
    const properties = name.startsWith('docProps/');
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      for (const attribute of Array.from(el.attributes)) {
        if (!properties && AUTHOR_ATTRIBUTES.has(attribute.localName)) add(attribute.value);
      }
      if (el.children.length > 0) continue;
      if (properties && !PROPERTY_ELEMENTS.has(el.localName) && !name.endsWith('custom.xml')) continue;
      add(el.textContent);
    }
  }
  return [...lines].join('\n');
}

/** The text with the hidden text after it, a blank line between; the text itself is unchanged. */
export function withHiddenText(text: string, hidden: string): string {
  return hidden ? `${text}\n\n${hidden}` : text;
}

export type UncheckedPart = 'charts' | 'media' | 'embeddings' | 'customXml' | 'sheetNames';

/**
 * What an Office file still holds that neither the text pass nor the clean-up
 * touches, so the review can say so. Parts that are read or removed are not
 * listed.
 */
export function uncheckedOfficeParts(bytes: Uint8Array): UncheckedPart[] {
  // Read the directory only; nothing is inflated.
  const names: string[] = [];
  unzipSync(bytes, { filter: (entry) => { names.push(entry.name); return false; } });
  const found: UncheckedPart[] = [];
  if (names.some((n) => /\/charts\//.test(n))) found.push('charts');
  if (names.some((n) => /\/media\//.test(n))) found.push('media');
  if (names.some((n) => /\/embeddings\//.test(n))) found.push('embeddings');
  if (names.some((n) => n.startsWith('customXml/'))) found.push('customXml');
  if (names.includes('xl/workbook.xml')) found.push('sheetNames');
  return found;
}
