/**
 * Turns the text that was checked plus the detector's spans into display segments for the Test tab.
 *
 * The engine reports offsets as UTF-8 byte positions (see shared/text-offsets.ts, the same conversion the review
 * overlay uses), so they are converted to JS string indices here. Spans are laid out left to right; a span that
 * overlaps one already placed is left out of the text view (it stays in the results list), the longer of two spans
 * that start together wins, and spans outside the text or with no length are ignored.
 */
import { byteOffsetToStringIndex } from '../shared/text-offsets';
import { categoryOf, type Category } from '../shared/design/categories';
import type { EntityType, PiiSpan } from '../shared/message-types';

export interface TextSegment {
  text: string;
  /** Present when this segment is a detected entity. */
  mark?: {
    /** Index into the original `spans` array (matches the results list). */
    index: number;
    type: EntityType;
    category: Category;
    score: number;
  };
}

export function segmentText(text: string, spans: readonly PiiSpan[]): TextSegment[] {
  const placed: Array<{ start: number; end: number; index: number; span: PiiSpan }> = [];
  spans.forEach((span, index) => {
    const start = byteOffsetToStringIndex(text, span.start);
    const end = byteOffsetToStringIndex(text, span.end);
    if (!(end > start) || start < 0 || end > text.length) return;
    placed.push({ start, end, index, span });
  });
  placed.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.index - b.index);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const p of placed) {
    if (p.start < cursor) continue; // overlaps an earlier span
    if (p.start > cursor) segments.push({ text: text.slice(cursor, p.start) });
    segments.push({
      text: text.slice(p.start, p.end),
      mark: { index: p.index, type: p.span.entity_type, category: categoryOf(p.span.entity_type), score: p.span.score },
    });
    cursor = p.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
