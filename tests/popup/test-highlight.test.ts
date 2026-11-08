import { segmentText } from '../../src/popup/test-highlight';
import type { EntityType, PiiSpan } from '../../src/shared/message-types';

const enc = new TextEncoder();
/** A span the way the engine reports it: UTF-8 byte offsets. */
function span(text: string, value: string, type: EntityType, score = 0.95, from = 0): PiiSpan {
  const idx = text.indexOf(value, from);
  if (idx < 0) throw new Error(`"${value}" not in text`);
  const start = enc.encode(text.slice(0, idx)).length;
  return { start, end: start + enc.encode(value).length, entity_type: type, score, text: value, source: 'regex' };
}
const texts = (s: ReturnType<typeof segmentText>) => s.map((x) => x.text);
const marks = (s: ReturnType<typeof segmentText>) => s.filter((x) => x.mark).map((x) => `${x.text}|${x.mark!.category}|${x.mark!.index}`);

describe('segmentText', () => {
  const text = 'Hej, jeg hedder Sebastian Gilson og bor på Nørrebrogade 4.\nMail: kontakt@ermias.ai';

  it('splits into plain and marked segments that re-join to the original text', () => {
    const spans = [span(text, 'Sebastian Gilson', 'PERSON'), span(text, 'kontakt@ermias.ai', 'EMAIL')];
    const seg = segmentText(text, spans);
    expect(seg.map((x) => x.text).join('')).toBe(text);
    expect(marks(seg)).toEqual(['Sebastian Gilson|name|0', 'kontakt@ermias.ai|email|1']);
  });

  it('converts UTF-8 byte offsets (æ ø å are multi-byte) to string positions', () => {
    const spans = [span(text, 'Nørrebrogade 4', 'ADDRESS'), span(text, 'kontakt@ermias.ai', 'EMAIL')];
    const seg = segmentText(text, spans);
    expect(marks(seg)).toEqual(['Nørrebrogade 4|address|0', 'kontakt@ermias.ai|email|1']);
  });

  it('handles spans at the very start and very end of the text', () => {
    const t = 'Mette ringer til 12345678';
    const seg = segmentText(t, [span(t, 'Mette', 'PERSON'), span(t, '12345678', 'PHONE')]);
    expect(texts(seg)).toEqual(['Mette', ' ringer til ', '12345678']);
    expect(seg[0].mark?.category).toBe('name');
    expect(seg[2].mark?.category).toBe('phone');
  });

  it('keeps newlines inside plain segments', () => {
    const seg = segmentText(text, [span(text, 'kontakt@ermias.ai', 'EMAIL')]);
    expect(seg[0].text).toContain('\n');
    expect(seg[0].mark).toBeUndefined();
  });

  it('keeps adjacent spans as separate marks', () => {
    const t = 'AB12';
    const seg = segmentText(t, [span(t, 'AB', 'MISC'), span(t, '12', 'PHONE')]);
    expect(texts(seg)).toEqual(['AB', '12']);
    expect(seg.every((x) => x.mark)).toBe(true);
  });

  it('leaves out a span that overlaps an earlier one, and prefers the longer span when they start together', () => {
    const t = 'ermias.ai og kontakt@ermias.ai';
    const lead = span(t, 'ermias.ai', 'EMAIL');
    const email = span(t, 'kontakt@ermias.ai', 'EMAIL');
    const inner = span(t, 'ermias.ai', 'ORGANIZATION', 1, t.indexOf('kontakt')); // inside the email: dropped
    const seg = segmentText(t, [inner, email, lead]);
    expect(marks(seg)).toEqual(['ermias.ai|email|2', 'kontakt@ermias.ai|email|1']);
    const nested = segmentText('kontakt@ermias.ai', [span('kontakt@ermias.ai', 'ermias.ai', 'EMAIL'), span('kontakt@ermias.ai', 'kontakt@ermias.ai', 'EMAIL')]);
    expect(marks(nested)).toEqual(['kontakt@ermias.ai|email|1']);
  });

  it('ignores empty, inverted and out-of-range spans, and works with no spans or empty text', () => {
    const bad: PiiSpan[] = [
      { start: 5, end: 5, entity_type: 'PERSON', score: 1, text: '', source: 'regex' },
      { start: 9, end: 3, entity_type: 'PERSON', score: 1, text: '', source: 'regex' },
      { start: 999, end: 1005, entity_type: 'PERSON', score: 1, text: '', source: 'regex' },
    ];
    expect(texts(segmentText('Hej verden', bad))).toEqual(['Hej verden']);
    expect(segmentText('Hej', [])).toEqual([{ text: 'Hej' }]);
    expect(segmentText('', [])).toEqual([]);
  });

  it('maps entity types to the same categories as the overlay', () => {
    const t = 'AI-udvikler hos ermias.ai';
    const seg = segmentText(t, [span(t, 'AI-udvikler', 'JOB_TITLE'), span(t, 'ermias.ai', 'ORGANIZATION')]);
    expect(seg.filter((x) => x.mark).map((x) => x.mark!.category)).toEqual(['job', 'org']);
  });
});
