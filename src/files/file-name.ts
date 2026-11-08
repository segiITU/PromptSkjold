import type { Replacement } from '../shared/anonymizer';
import type { PiiSpan } from '../shared/message-types';
import { applyReplacements } from './replace';

/** Name used when nothing is left of a file name after its personal data is replaced. */
const NEUTRAL_BASE = 'dokument';
const NEUTRAL_NAME = `${NEUTRAL_BASE}-1`;
const MAX_STEM_LENGTH = 120;

export interface FileNameParts {
  stem: string;
  /** With its dot, or empty. */
  ext: string;
}

/** "report.final.pdf" -> { stem: "report.final", ext: ".pdf" } */
export function splitFileName(name: string): FileNameParts {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/** The name as the detector reads it. Underscores run words together, so they become spaces; every position stays. */
export function nameForDetection(stem: string): string {
  return stem.replace(/_/g, ' ');
}

/** A review of a file's name and its text together, and the way back from the overlay's answers. */
export interface JoinedReview {
  text: string;
  spans: PiiSpan[];
  /** True for a span that lies in the file name. */
  isName(span: PiiSpan): boolean;
  /** A span of the joined text, moved to where it sits in the file's own text. */
  unshift(span: PiiSpan): PiiSpan;
  /** The spans that belong to the file's own text, in its coordinates. */
  bodySpans(spans: PiiSpan[]): PiiSpan[];
  /** The replacements that belong to the file's own text, in its coordinates. */
  bodyReplacements(replacements: Replacement[]): Replacement[];
  /** The file name once the replacements that touch it are applied. */
  fileName(replacements: Replacement[]): string;
}

/**
 * Put the file name in front of the text so one review covers both:
 * "Filnavn: Lønseddel Mette Hansen", a blank line, then the text. With no
 * finding in the name the review is the text as it was.
 */
export function joinNameAndBody(
  label: string,
  fileName: string,
  nameSpans: PiiSpan[],
  body: string,
  bodySpans: PiiSpan[],
): JoinedReview {
  const { stem } = splitFileName(fileName);
  if (nameSpans.length === 0) {
    return {
      text: body,
      spans: bodySpans,
      isName: () => false,
      unshift: (span) => span,
      bodySpans: (spans) => spans,
      bodyReplacements: (replacements) => replacements,
      fileName: () => fileName,
    };
  }

  const nameStart = label.length;
  const nameEnd = nameStart + stem.length;
  const bodyStart = body ? nameEnd + 2 : nameEnd;
  const text = `${label}${nameForDetection(stem)}${body ? `\n\n${body}` : ''}`;
  const move = (span: PiiSpan, by: number): PiiSpan => ({ ...span, start: span.start + by, end: span.end + by });
  const isName = (span: PiiSpan) => span.start < nameEnd;

  return {
    text,
    spans: [...nameSpans.map((s) => move(s, nameStart)), ...bodySpans.map((s) => move(s, bodyStart))],
    isName,
    unshift: (span) => (isName(span) ? move(span, -nameStart) : move(span, -bodyStart)),
    bodySpans: (spans) => spans.filter((s) => !isName(s)).map((s) => move(s, -bodyStart)),
    bodyReplacements: (replacements) =>
      replacements.filter((r) => r.start >= bodyStart).map((r) => ({ ...r, start: r.start - bodyStart, end: r.end - bodyStart })),
    fileName: (replacements) =>
      cleanFileName(
        fileName,
        replacements.filter((r) => r.end <= nameEnd).map((r) => ({ ...r, start: r.start - nameStart, end: r.end - nameStart })),
      ),
  };
}

/**
 * A name with nothing of the original left but its extension. Used where a copy is made by blacking out
 * (pictures and PDFs), so there is no replacement to put in the name. The number keeps the files of one selection apart.
 */
export function neutralFileName(fileName: string, index: number): string {
  return `${NEUTRAL_BASE}-${index}${splitFileName(fileName).ext}`;
}

/** The file name with the replacements (positions in the name without its extension) applied. */
export function cleanFileName(fileName: string, replacements: Replacement[]): string {
  if (replacements.length === 0) return fileName;
  const { stem, ext } = splitFileName(fileName);
  const safe = applyReplacements(stem, replacements)
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, MAX_STEM_LENGTH);
  return `${safe || NEUTRAL_NAME}${ext}`;
}
