import {
  capitalizedWordCount,
  dropNerNoise,
  isNerNoise,
  trimTrailingPunctuation,
} from '../../src/offscreen/ner-noise-filter';
import { mapBardsAiLabelToEntityType } from '../../src/offscreen/ner-provider';
import type { PiiSpan } from '../../src/shared/message-types';

function span(entity_type: PiiSpan['entity_type'], text: string): PiiSpan {
  return { start: 0, end: text.length, entity_type, score: 0.9, text, source: 'ner' };
}

describe('NER noise filter', () => {
  it('drops log levels, HTTP verbs and literals', () => {
    for (const text of ['INFO', 'WARN', 'error', 'GET', 'POST', 'null', 'true']) {
      expect(isNerNoise(span('PERSON', text))).toBe(true);
    }
  });

  it('drops generic role words whatever the type', () => {
    for (const text of ['customer', 'User', 'kunde', 'Bruger']) {
      expect(isNerNoise(span('PERSON', text))).toBe(true);
      expect(isNerNoise(span('ORGANIZATION', text))).toBe(true);
    }
  });

  it('drops countries and regions only as LOCATION', () => {
    expect(isNerNoise(span('LOCATION', 'Danmark'))).toBe(true);
    expect(isNerNoise(span('LOCATION', 'the Alps'))).toBe(true);
    expect(isNerNoise(span('LOCATION', 'Scotland.'))).toBe(true);
    expect(isNerNoise(span('PERSON', 'Wales'))).toBe(false);
  });

  it('keeps cities, people and organisations', () => {
    expect(isNerNoise(span('LOCATION', 'Aarhus C'))).toBe(false);
    expect(isNerNoise(span('PERSON', 'Peter Hansen'))).toBe(false);
    expect(isNerNoise(span('ORGANIZATION', 'Nordlys Consulting ApS'))).toBe(false);
  });

  it('filters arrays', () => {
    const kept = dropNerNoise([span('LOCATION', 'WARN'), span('PERSON', 'Mette Sørensen')]);
    expect(kept).toEqual([span('PERSON', 'Mette Sørensen')]);
  });

  it('counts capitalised words, including Danish letters, and ignores ALL-CAPS levels', () => {
    expect(capitalizedWordCount('2025-03-01 12:00:00 INFO [auth] request ok took 12ms')).toBe(0);
    expect(capitalizedWordCount('customer Peter Hansen bor i Ørestad')).toBe(3);
    expect(capitalizedWordCount('')).toBe(0);
  });
});

describe('BardsAI label mapping', () => {
  it('no longer reports product/account codes as usernames', () => {
    expect(mapBardsAiLabelToEntityType('B-ACCOUNT_IDENTIFIER')).toBe('MISC');
    expect(mapBardsAiLabelToEntityType('B-CONTACT_HANDLE')).toBe('USERNAME');
  });
});

describe('trimTrailingPunctuation', () => {
  test('drops a trailing comma and shortens the span', () => {
    const [out] = trimTrailingPunctuation([{ text: 'Lars Pedersen,', end: 20 }]);
    expect(out).toEqual({ text: 'Lars Pedersen', end: 19 });
  });
  test('leaves clean spans and initials alone', () => {
    const spans = [{ text: 'Mette S.', end: 8 }, { text: 'Anna', end: 4 }];
    expect(trimTrailingPunctuation(spans)).toEqual(spans);
  });
});
