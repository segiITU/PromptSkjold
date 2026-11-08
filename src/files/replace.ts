import type { Replacement } from '../shared/anonymizer';

/** Apply substitutions (positions in `text`) and return the new text. */
export function applyReplacements(text: string, replacements: Replacement[]): string {
  let out = '';
  let cursor = 0;
  for (const r of [...replacements].sort((a, b) => a.start - b.start)) {
    if (r.start < cursor) continue; // overlapping; the first one wins
    out += text.slice(cursor, r.start) + r.text;
    cursor = r.end;
  }
  return out + text.slice(cursor);
}

/**
 * A replacement must not break the structure of a delimited file: a comma,
 * semicolon, tab, quote or line break inside it would split or merge cells.
 */
export function makeCellSafe(replacements: Replacement[]): Replacement[] {
  return replacements.map((r) => ({ ...r, text: r.text.replace(/[,;\t\r\n"]+/g, ' ').replace(/ {2,}/g, ' ') }));
}
