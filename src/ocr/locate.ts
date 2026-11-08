import type { OcrBox, OcrWord } from './types';

/** Longest run of pieces that may together spell one detected item. */
const MAX_PIECES_PER_SPAN = 24;
/** An item shorter than this may only match a whole piece, never part of one. */
const MIN_PARTIAL_LENGTH = 4;

/** An item must be at least this long (after folding) to tolerate one misread character. */
const MIN_FUZZY_LENGTH = 8;
/** ...and contain at least this many letters, so numbers made of digits only (CPR, phone, account) still have to match exactly. */
const MIN_FUZZY_LETTERS = 2;

/**
 * Letters and digits only, with the look-alikes OCR confuses folded together on
 * both sides of the comparison: æ/ae/å/aa/a, ø/oe/o, I/l/1/|, O/0. The OCR
 * engine drops or swaps these in scans ("Årsopgørelse" -> "Arsopggrelse",
 * "PII" -> "PIl"), while the detector sees the cleaned text.
 */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@|]/gu, '')
    .replace(/ae|aa|oe|[æåä]/g, 'a')
    .replace(/[øö]/g, 'o')
    .replace(/[il1|íìï]/g, 'l')
    .replace(/[o0]/g, '0');
}

/** The consonant skeleton must be at least this long for the last-resort match. */
const MIN_SKELETON_LENGTH = 6;

/**
 * The letters OCR reads least reliably in Danish names are the vowels, above all æ, ø and å
 * ("Bjørn Højeng Vesterkær" came back as "Bjorn Hajeng Vesterkzer"), so as a last resort only the
 * consonants and digits are compared: every vowel, z and æ/ø/å is one placeholder, and a run of them is one.
 */
function skeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@]/gu, '')
    .replace(/[aeiouyzæøåäö]+/g, 'a');
}

/** Whether the two strings are equal or differ by one substitution, insertion or deletion. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** A piece of an OCR word, split at hyphens, dots, commas and the like. */
interface Piece {
  text: string;
  /** The piece as the engine read it, for the consonant skeleton. */
  raw: string;
  word: number;
}

/**
 * Words are split into pieces so that an item that is only part of a word
 * ("DK" inside "DK-8837-2201") can still be found. A match is always painted
 * over as whole words, so what is left of the word never stays visible.
 */
function piecesOf(words: OcrWord[]): Piece[] {
  const out: Piece[] = [];
  words.forEach((word, i) => {
    for (const part of word.text.split(/[^\p{L}\p{N}@]+/u)) {
      const text = norm(part);
      if (text) out.push({ text, raw: part, word: i });
    }
  });
  return out;
}

/**
 * Index range [start, end] of the first run of pieces that spells `target`, from `from` on.
 * With `fuzzy`, a run that is one misread character away also counts.
 */
function findRun(
  pieces: Piece[],
  target: string,
  from: number,
  skip?: (pieceIndex: number) => boolean,
  fuzzy = false,
): [number, number] | null {
  for (let start = from; start < pieces.length; start++) {
    if (skip?.(start)) continue;
    let acc = '';
    for (let end = start; end < Math.min(pieces.length, start + MAX_PIECES_PER_SPAN); end++) {
      if (skip?.(end)) break;
      acc += pieces[end].text;
      const exact = acc === target;
      const insideOnePiece = end === start && target.length >= MIN_PARTIAL_LENGTH && acc.includes(target);
      if (exact || insideOnePiece) return [start, end];
      if (fuzzy && withinOneEdit(acc, target)) return [start, end];
      if (acc.length > target.length + (fuzzy ? 1 : 0)) break;
    }
  }
  return null;
}

/** Only names, addresses, emails and the like may be matched with a typo; numbers must match exactly. */
function mayBeFuzzy(text: string, target: string): boolean {
  return target.length >= MIN_FUZZY_LENGTH && (text.match(/\p{L}/gu)?.length ?? 0) >= MIN_FUZZY_LETTERS;
}

/** Index range of the first run of pieces whose consonant skeletons spell the item's skeleton. */
function findSkeletonRun(
  pieces: Piece[],
  text: string,
  from: number,
  skip?: (pieceIndex: number) => boolean,
): [number, number] | null {
  const target = skeleton(text);
  if (target.length < MIN_SKELETON_LENGTH) return null;
  for (let start = from; start < pieces.length; start++) {
    if (skip?.(start)) continue;
    let acc = '';
    for (let end = start; end < Math.min(pieces.length, start + MAX_PIECES_PER_SPAN); end++) {
      if (skip?.(end)) break;
      acc = skeleton(acc + pieces[end].raw);
      if (acc === target) return [start, end];
      if (acc.length > target.length) break;
    }
  }
  return null;
}

/** The exact spelling is preferred; a one-character difference is only tried when there is no exact run. */
function findRunTolerant(
  pieces: Piece[],
  text: string,
  target: string,
  from: number,
  skip?: (pieceIndex: number) => boolean,
): [number, number] | null {
  return findRun(pieces, target, from, skip) ?? (mayBeFuzzy(text, target) ? findRun(pieces, target, from, skip, true) : null);
}

/** Whole-word indices covered by pieces start..end. */
function wordsOf(pieces: Piece[], start: number, end: number): number[] {
  const words = new Set<number>();
  for (let k = start; k <= end; k++) words.add(pieces[k].word);
  return [...words];
}

/**
 * Find the word boxes behind each detected item (the first unused place where
 * it occurs). The detector works on the cleaned OCR text, so its offsets do not
 * line up with the engine's words; items are matched by their letters and
 * digits, ignoring spaces and punctuation and the look-alikes OCR confuses
 * (see `norm`). A name, address or email that is one misread character off
 * still matches when there is no exact match. Items that cannot be matched get an
 * empty list; the caller must tell the user, because a redacted copy would
 * still show them.
 */
export function locateItems(words: OcrWord[], itemTexts: string[]): OcrBox[][] {
  const pieces = piecesOf(words);
  const usedPieces = new Set<number>();
  return itemTexts.map((text) => {
    const target = norm(text);
    if (!target) return [];
    const run =
      findRunTolerant(pieces, text, target, 0, (k) => usedPieces.has(k)) ??
      (mayBeFuzzy(text, target) ? findSkeletonRun(pieces, text, 0, (k) => usedPieces.has(k)) : null);
    if (!run) return [];
    for (let k = run[0]; k <= run[1]; k++) usedPieces.add(k);
    return wordsOf(pieces, run[0], run[1]).map((w) => words[w].box);
  });
}

/**
 * Every place on a page where any of the items occurs, for blacking out a
 * whole page rather than listing items once. Also returns which items were
 * found, so the caller can add them up across pages.
 */
export function locateEverywhere(
  words: OcrWord[],
  itemTexts: string[],
): { boxes: OcrBox[]; found: Set<string> } {
  const pieces = piecesOf(words);
  const painted = new Set<number>();
  const boxes: OcrBox[] = [];
  const found = new Set<string>();
  // Longest first, so "Mikkel Rask" is matched as a whole before "Mikkel" alone.
  const texts = [...new Set(itemTexts)].sort((x, y) => y.length - x.length);
  for (const text of texts) {
    const target = norm(text);
    if (!target) continue;
    let from = 0;
    for (;;) {
      const run = findRunTolerant(pieces, text, target, from);
      if (!run) break;
      // An item whose words were already covered by a longer one is still found.
      found.add(text);
      for (const w of wordsOf(pieces, run[0], run[1])) {
        if (painted.has(w)) continue;
        painted.add(w);
        boxes.push(words[w].box);
      }
      from = run[1] + 1;
    }
    // A copy of the item that OCR misread comes in a second pass, so an exact hit elsewhere does not hide it.
    if (mayBeFuzzy(text, target)) {
      const taken = (k: number) => painted.has(pieces[k].word);
      for (let from = 0; ; ) {
        const run = findRun(pieces, target, from, taken, true);
        if (!run) break;
        found.add(text);
        for (const w of wordsOf(pieces, run[0], run[1])) {
          painted.add(w);
          boxes.push(words[w].box);
        }
        from = run[1] + 1;
      }
    }
    // Words that only the consonants give away. This runs even when the item was found elsewhere: the same address
    // can stand in the body (read as "Fabelstreede") and in a footer (read exactly), and both must be covered.
    if (mayBeFuzzy(text, target)) {
      for (let from = 0; ; ) {
        const run = findSkeletonRun(pieces, text, from, (k) => painted.has(pieces[k].word));
        if (!run) break;
        found.add(text);
        for (const w of wordsOf(pieces, run[0], run[1])) {
          painted.add(w);
          boxes.push(words[w].box);
        }
        from = run[1] + 1;
      }
    }
  }
  return { boxes, found };
}

export function scaleBox(box: OcrBox, factor: number): OcrBox {
  return { x0: box.x0 * factor, y0: box.y0 * factor, x1: box.x1 * factor, y1: box.y1 * factor };
}
