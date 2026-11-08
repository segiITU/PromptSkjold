import type { Replacement } from '../shared/anonymizer';
import { baseName } from './kinds';
import { applyReplacements, makeCellSafe } from './replace';

/** Text files larger than this are not read. */
export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const DELIMITED = /\.(csv|tsv)$/i;

/** A copy of a text/CSV file with the replacements applied, keeping its name (or the given one) and type. */
export function buildTextFile(file: File, text: string, replacements: Replacement[], name = file.name): File {
  const safe = DELIMITED.test(name) ? makeCellSafe(replacements) : replacements;
  return new File([applyReplacements(text, safe)], name.replace(/(\.[^.]+)?$/, '-anonymised$1'), {
    type: file.type || 'text/plain',
  });
}

/** A plain-text copy of extracted text (for PDFs), with the replacements applied. */
export function buildPlainTextCopy(originalName: string, text: string, replacements: Replacement[]): File {
  return new File([applyReplacements(text, replacements)], `${baseName(originalName)}-anonymised.txt`, {
    type: 'text/plain',
  });
}
