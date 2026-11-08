import { joinNameParticles } from '../../src/offscreen/ner-provider';
import type { PiiSpan } from '../../src/shared/message-types';

const encoder = new TextEncoder();

/** Builds a PERSON span for `name` at its first occurrence after `from`, with UTF-8 byte offsets. */
function person(text: string, name: string, from = 0): PiiSpan {
  const charIndex = text.indexOf(name, from);
  if (charIndex < 0) throw new Error(`"${name}" not found in "${text}"`);
  const start = encoder.encode(text.slice(0, charIndex)).length;
  const end = start + encoder.encode(name).length;
  return { start, end, entity_type: 'PERSON', score: 0.9, text: name, source: 'ner' };
}

describe('joinNameParticles', () => {
  test('joins a Faroese particle between two name parts', () => {
    const text = 'Skriv til Rói í Dali om aftalen';
    const spans = [person(text, 'Rói'), person(text, 'Dali')];
    const joined = joinNameParticles(text, spans);
    expect(joined.map((s) => s.text)).toEqual(['Rói í Dali']);
  });

  test('joins several particles and keeps the higher score', () => {
    const text = 'Peter van der Berg ringede';
    const spans = [{ ...person(text, 'Peter'), score: 0.7 }, { ...person(text, 'Berg'), score: 0.95 }];
    const joined = joinNameParticles(text, spans);
    expect(joined.map((s) => s.text)).toEqual(['Peter van der Berg']);
    expect(joined[0].score).toBe(0.95);
  });

  test('joins "de"/"af" only before a capitalised name part', () => {
    const upper = 'Mette de Nielsen kom i går';
    expect(joinNameParticles(upper, [person(upper, 'Mette'), person(upper, 'Nielsen')]).map((s) => s.text)).toEqual([
      'Mette de Nielsen',
    ]);
    const lower = 'Mette de nielsen kom i går';
    expect(joinNameParticles(lower, [person(lower, 'Mette'), person(lower, 'nielsen')])).toHaveLength(2);
  });

  test('keeps two people separate when anything else sits between them', () => {
    for (const text of ['Rói og Dali kom', 'Rói, Dali kom', 'Rói skrev til Dali', 'Rói í går Dali']) {
      const spans = [person(text, 'Rói'), person(text, 'Dali')];
      expect(joinNameParticles(text, spans)).toHaveLength(2);
    }
  });

  test('does not join across other entity types or touch a lone span', () => {
    const text = 'Rói í Dali';
    const org: PiiSpan = { ...person(text, 'Dali'), entity_type: 'ORGANIZATION' };
    expect(joinNameParticles(text, [person(text, 'Rói'), org])).toHaveLength(2);
    expect(joinNameParticles(text, [person(text, 'Rói')])).toHaveLength(1);
  });
});
