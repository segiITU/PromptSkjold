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
} from './ooxml-text';

/** PowerPoint files larger than this are not read. */
export const MAX_PPTX_BYTES = MAX_OFFICE_BYTES;

const DRAWING: TextFlavour = {
  ns: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  paragraph: 'p',
  text: 't',
  br: 'br',
};

/** Slide text first, then speaker notes, then SmartArt text, each in slide order. */
function textPartNames(parts: Unzipped): string[] {
  return [
    ...numberedParts(parts, /^ppt\/slides\/slide\d+\.xml$/),
    ...numberedParts(parts, /^ppt\/notesSlides\/notesSlide\d+\.xml$/),
    ...numberedParts(parts, /^ppt\/diagrams\/data\d+\.xml$/),
  ];
}

function load(bytes: Uint8Array) {
  const parts = readZipParts(bytes);
  if (!parts['ppt/presentation.xml']) throw new Error('Not a PowerPoint file (ppt/presentation.xml is missing).');
  return { parts, loaded: loadTextParts(parts, textPartNames(parts), DRAWING, 'PowerPoint file') };
}

/**
 * The text of the slides, speaker notes and SmartArt, one paragraph per line, then the author and comments
 * (which the copy leaves out; see {@link hiddenOfficeText}).
 * Slide masters, charts and embedded files are not included.
 */
export function extractPptxText(bytes: Uint8Array): string {
  const { parts, loaded } = load(bytes);
  return withHiddenText(textOfParts(loaded), hiddenOfficeText(parts));
}

/**
 * A copy of the presentation with the replacements applied inside its text
 * runs, so layout and formatting stay as they were. `replacements` are
 * positions in the text returned by {@link extractPptxText}.
 */
export function buildPptx(bytes: Uint8Array, replacements: Replacement[]): Uint8Array {
  const { parts, loaded } = load(bytes);
  applyToTextParts(loaded, replacements);
  // Slides written by Microsoft 365 point at their modern comments with a relationship id; the comments go, so does the pointer.
  for (const { doc } of loaded) {
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      if (el.localName === 'commentRel') el.parentNode?.removeChild(el);
    }
  }
  for (const part of loaded) parts[part.name] = serializeXml(part.doc);
  // Properties (author) and comments are not read, so the copy does not carry them.
  removePrivateParts(parts);
  return zipSync(parts);
}

export function pptxFileName(name: string): string {
  return `${baseName(name)}-anonymised.pptx`;
}
