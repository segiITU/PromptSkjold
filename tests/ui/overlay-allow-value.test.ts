import { get } from 'svelte/store';
import { OverlayModel } from '../../src/ui/overlay/overlay-model';
import type { PiiSpan } from '../../src/shared/message-types';

function span(text: string, start: number, type: PiiSpan['entity_type'] = 'PERSON'): PiiSpan {
  return { start, end: start + text.length, entity_type: type, score: 0.9, text, source: 'ner' };
}

function makeModel() {
  const onAddToAllowlist = jest.fn();
  const callbacks = {
    onFeedback: jest.fn(),
    onAddToAllowlist,
    onEditDetails: jest.fn(),
  } as never;
  const text = 'Mauris and Mauris met Lars and Mauris.';
  const spans = [span('Mauris', 0), span('Mauris', 11), span('Lars', 22), span('Mauris', 31)];
  return { model: new OverlayModel(text, spans, callbacks, 0.5), onAddToAllowlist };
}

describe('always allow this value', () => {
  test('releases every occurrence of the value, not other values', () => {
    const { model, onAddToAllowlist } = makeModel();
    model.openDismissMenu(1, { top: 0, left: 0, width: 0, height: 0 } as never);
    model.confirmDismiss('value');

    const states = get(model.spanStates);
    expect(states.map((s) => s.enabled)).toEqual([false, false, true, false]);
    expect(states.map((s) => s.whitelisted)).toEqual([true, true, false, true]);
    expect(onAddToAllowlist).toHaveBeenCalledWith('Mauris');
  });

  test('"just this time" only releases that one occurrence', () => {
    const { model } = makeModel();
    model.openDismissMenu(1, { top: 0, left: 0, width: 0, height: 0 } as never);
    model.confirmDismiss('none');
    expect(get(model.spanStates).map((s) => s.enabled)).toEqual([true, false, true, true]);
  });
});
