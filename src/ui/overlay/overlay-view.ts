/**
 * Pure view-building for the review overlay: turns the model's span state
 * into per-paragraph HTML for the two "sheets" (your text with marks, and
 * what will be sent), plus the replacement token for each finding.
 *
 * No DOM, no stores, so it is unit-testable. Everything interpolated into
 * HTML is escaped here.
 */
import { byteOffsetToStringIndex } from '../../shared/text-offsets';
import { categoryOf, type Category } from '../../shared/design/categories';
import type { EntityType, PiiSpan } from '../../shared/message-types';

export interface ViewSpanState {
  span: PiiSpan;
  enabled: boolean;
  entityType: EntityType;
  whitelisted: boolean;
}

export interface ViewMark {
  cat: Category;
  enabled: boolean;
}

export interface ViewParagraph {
  html: string;
  marks: ViewMark[];
}

export interface OverlayView {
  original: ViewParagraph[];
  result: ViewParagraph[];
  /** Replacement text per detected-span index (only for spans that are replaced). */
  tokens: Record<number, string>;
}

export type Resolver = ((span: PiiSpan) => string) | null;

export interface ViewInput {
  text: string;
  states: ViewSpanState[];
  manuals: PiiSpan[];
  resolver: Resolver;
  /** Detected-span indices that were just switched to "replace": get a one-off strike and stamp. */
  fresh: ReadonlySet<number>;
  label: (type: EntityType) => string;
}

interface Marker {
  start: number;
  end: number;
  span: PiiSpan;
  type: EntityType;
  detected: number | null;
  enabled: boolean;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortMarkers(markers: Marker[]): Marker[] {
  return markers.sort((a, b) => a.span.start - b.span.start);
}

/** Drop markers that overlap an earlier one (same rule the plain-text preview always used). */
function nonOverlapping(markers: Marker[]): Marker[] {
  const out: Marker[] = [];
  let cursor = 0;
  for (const m of markers) {
    if (m.start < cursor) continue;
    out.push(m);
    cursor = m.end;
  }
  return out;
}

function paragraphRanges(text: string, markers: Marker[]): Array<[number, number]> {
  const cuts: Array<[number, number]> = [];
  const re = /\n\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = m.index;
    const b = a + m[0].length;
    // A finding that spans the blank line keeps both halves in one paragraph.
    if (!markers.some((k) => k.start < b && k.end > a)) cuts.push([a, b]);
  }
  const ranges: Array<[number, number]> = [];
  let from = 0;
  for (const [a, b] of cuts) {
    ranges.push([from, a]);
    from = b;
  }
  ranges.push([from, text.length]);
  return ranges.filter(([s, e]) => text.slice(s, e).trim().length > 0);
}

export function buildOverlayView(input: ViewInput): OverlayView {
  const { text, states, manuals, resolver, fresh, label } = input;
  const toIndex = (byte: number) => byteOffsetToStringIndex(text, byte);

  const originalMarkers: Marker[] = [];
  states.forEach((s, i) => {
    if (s.span.inCodeBlock) return;
    originalMarkers.push({
      start: toIndex(s.span.start),
      end: toIndex(s.span.end),
      span: s.span,
      type: s.entityType,
      detected: i,
      enabled: s.enabled,
    });
  });
  manuals.forEach((span) =>
    originalMarkers.push({
      start: toIndex(span.start),
      end: toIndex(span.end),
      span,
      type: span.entity_type,
      detected: null,
      enabled: true,
    }),
  );

  const resultMarkers: Marker[] = [];
  states.forEach((s, i) => {
    if (!s.enabled) return;
    resultMarkers.push({
      start: toIndex(s.span.start),
      end: toIndex(s.span.end),
      span: s.span,
      type: s.entityType,
      detected: i,
      enabled: true,
    });
  });
  manuals.forEach((span) =>
    resultMarkers.push({
      start: toIndex(span.start),
      end: toIndex(span.end),
      span,
      type: span.entity_type,
      detected: null,
      enabled: true,
    }),
  );

  const orig = nonOverlapping(sortMarkers(originalMarkers));
  const res = nonOverlapping(sortMarkers(resultMarkers));

  // Replacement tokens, in text order, exactly as the plain preview used to compute them.
  const counters: Record<string, number> = {};
  const tokenFor = new Map<Marker, string>();
  const tokens: Record<number, string> = {};
  for (const m of res) {
    counters[m.type] = (counters[m.type] || 0) + 1;
    const token = resolver ? resolver({ ...m.span, entity_type: m.type }) : `[${m.type}_${counters[m.type]}]`;
    tokenFor.set(m, token);
    if (m.detected !== null) tokens[m.detected] = token;
  }

  const ranges = paragraphRanges(text, [...orig, ...res]);

  const original: ViewParagraph[] = ranges.map(([ps, pe]) => {
    let html = '';
    let cursor = ps;
    const marks: ViewMark[] = [];
    for (const m of orig) {
      if (m.start < ps || m.end > pe) continue;
      html += escapeHtml(text.slice(cursor, m.start));
      const cat = categoryOf(m.type);
      const pct = Math.round(m.span.score * 100);
      const cls = ['pk-mk', 'pg-highlight'];
      if (!m.enabled) cls.push('pk-off');
      if (m.detected !== null && m.enabled && fresh.has(m.detected)) cls.push('pk-strike');
      const idx = m.detected !== null ? ` data-pg-span-index="${m.detected}"` : ' data-manual="1"';
      html +=
        `<span class="${cls.join(' ')}" data-cat="${cat}"${idx} title="${escapeHtml(label(m.type))} (${pct} %)">` +
        `${escapeHtml(text.slice(m.start, m.end))}</span>`;
      cursor = m.end;
      marks.push({ cat, enabled: m.enabled });
    }
    html += escapeHtml(text.slice(cursor, pe));
    return { html, marks };
  });

  const result: ViewParagraph[] = ranges.map(([ps, pe]) => {
    let html = '';
    let cursor = ps;
    const marks: ViewMark[] = [];
    let n = 0;
    for (const m of res) {
      if (m.start < ps || m.end > pe) continue;
      html += escapeHtml(text.slice(cursor, m.start));
      const cat = categoryOf(m.type);
      const stamp = m.detected !== null && fresh.has(m.detected);
      html +=
        `<span class="pk-tag${stamp ? ' pk-stamp' : ''}" data-cat="${cat}" style="--d:${stamp ? 380 + n * 70 : 0}ms">` +
        `${escapeHtml(tokenFor.get(m) ?? '')}</span>`;
      cursor = m.end;
      marks.push({ cat, enabled: true });
      n += 1;
    }
    html += escapeHtml(text.slice(cursor, pe));
    return { html, marks };
  });

  return { original, result, tokens };
}
