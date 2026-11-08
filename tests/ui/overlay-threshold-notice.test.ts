import { get } from 'svelte/store';
import { OverlayModel, meetsThreshold } from '../../src/ui/overlay/overlay-model';
import type { PiiSpan } from '../../src/shared/message-types';

function span(text: string, start: number, score: number): PiiSpan {
  return { start, end: start + text.length, entity_type: 'PERSON', score, text, source: 'ner' };
}

function makeModel(scores: number[]) {
  const text = 'Anna Berit Carl Dorte';
  const spans = [span('Anna', 0, scores[0]), span('Berit', 5, scores[1]), span('Carl', 11, scores[2])];
  return new OverlayModel(text, spans, {} as never, 0.5);
}

describe('meetsThreshold compares the percentages the list shows', () => {
  test('a score shown as 100% passes a 100% threshold', () => {
    expect(meetsThreshold(0.996, 1)).toBe(true);
    expect(meetsThreshold(0.9951, 1)).toBe(true);
  });

  test('a score shown as 99% does not', () => {
    expect(meetsThreshold(0.994, 1)).toBe(false);
  });

  test('ordinary thresholds are unchanged', () => {
    expect(meetsThreshold(0.5, 0.5)).toBe(true);
    expect(meetsThreshold(0.49, 0.5)).toBe(false);
    expect(meetsThreshold(0.7, 0.5)).toBe(true);
  });
});

describe('the confidence slider', () => {
  test('at 100% keeps items that are shown as 100% and drops those shown as less', () => {
    const model = makeModel([0.996, 1, 0.99]);
    model.setThreshold(1);
    expect(get(model.spanStates).map((s) => s.enabled)).toEqual([true, true, false]);
  });

  test('the "below threshold" marking agrees with what is kept', () => {
    const model = makeModel([0.996, 1, 0.99]);
    model.setThreshold(1);
    expect(get(model.spanStates).map((s) => model.isBelowThreshold(s))).toEqual([false, false, true]);
  });
});

describe('notice when an item is clicked', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('says "Mark removed" and switches the item off', () => {
    const model = makeModel([0.9, 0.9, 0.9]);
    model.toggleWithNotice(0, false);
    expect(get(model.notice)).toBe('Mark removed');
    expect(get(model.spanStates)[0].enabled).toBe(false);
  });

  test('says so when an item is put back', () => {
    const model = makeModel([0.9, 0.9, 0.9]);
    model.toggleWithNotice(0, false);
    model.toggleWithNotice(0, true);
    expect(get(model.notice)).toBe('Mark put back');
  });

  test('goes away by itself', () => {
    const model = makeModel([0.9, 0.9, 0.9]);
    model.toggleWithNotice(1, false);
    jest.advanceTimersByTime(2000);
    expect(get(model.notice)).toBeNull();
  });
});
