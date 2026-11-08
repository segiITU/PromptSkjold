import { buildOverlayView, type ViewSpanState } from '../../src/ui/overlay/overlay-view';
import type { PiiSpan } from '../../src/shared/message-types';

const enc = new TextEncoder();
function span(text: string, source: string, type: PiiSpan['entity_type'], score = 0.95): PiiSpan {
  const idx = source.indexOf(text);
  const start = enc.encode(source.slice(0, idx)).length;
  return { start, end: start + enc.encode(text).length, entity_type: type, score, text, source: 'regex' };
}
const state = (s: PiiSpan, enabled = true): ViewSpanState => ({ span: s, enabled, entityType: s.entity_type, whitelisted: false });
const label = (t: string) => t;

describe('buildOverlayView', () => {
  const text = 'Hej Mette,\n\nskriv til mette@firma.dk.\n\nVh';

  it('splits paragraphs on blank lines and puts each finding in its own paragraph', () => {
    const view = buildOverlayView({
      text,
      states: [state(span('Mette', text, 'PERSON')), state(span('mette@firma.dk', text, 'EMAIL'))],
      manuals: [],
      resolver: null,
      fresh: new Set(),
      label,
    });
    expect(view.original).toHaveLength(3);
    expect(view.original[0].marks).toEqual([{ cat: 'name', enabled: true }]);
    expect(view.original[1].marks).toEqual([{ cat: 'email', enabled: true }]);
    expect(view.original[2].marks).toEqual([]);
    expect(view.result).toHaveLength(3);
    expect(view.result[1].html).toContain('[EMAIL_1]');
    expect(view.tokens).toEqual({ 0: '[PERSON_1]', 1: '[EMAIL_1]' });
  });

  it('keeps a finding that spans a blank line in one paragraph', () => {
    const t = 'Adresse: Vej 1\n\n2200 København';
    const view = buildOverlayView({
      text: t,
      states: [state(span('Vej 1\n\n2200 København', t, 'ADDRESS'))],
      manuals: [],
      resolver: null,
      fresh: new Set(),
      label,
    });
    expect(view.original).toHaveLength(1);
  });

  it('leaves kept findings as plain text in the result and dimmed in the original', () => {
    const view = buildOverlayView({
      text,
      states: [state(span('Mette', text, 'PERSON'), false)],
      manuals: [],
      resolver: null,
      fresh: new Set(),
      label,
    });
    expect(view.original[0].html).toContain('pk-off');
    expect(view.result[0].html).not.toContain('pk-tag');
    expect(view.result[0].html).toContain('Mette');
    expect(view.tokens).toEqual({});
  });

  it('escapes HTML in the text', () => {
    const t = 'a <b> & "q" mette@firma.dk';
    const view = buildOverlayView({
      text: t,
      states: [state(span('mette@firma.dk', t, 'EMAIL'))],
      manuals: [],
      resolver: null,
      fresh: new Set(),
      label,
    });
    expect(view.original[0].html).toContain('a &lt;b&gt; &amp; &quot;q&quot; ');
    expect(view.original[0].html).not.toContain('<b>');
  });

  it('adds strike and stamp classes only for freshly replaced findings', () => {
    const states = [state(span('Mette', text, 'PERSON')), state(span('mette@firma.dk', text, 'EMAIL'))];
    const view = buildOverlayView({ text, states, manuals: [], resolver: null, fresh: new Set([1]), label });
    expect(view.original[1].html).toContain('pk-strike');
    expect(view.original[0].html).not.toContain('pk-strike');
    expect(view.result[1].html).toContain('pk-stamp');
    expect(view.result[0].html).not.toContain('pk-stamp');
  });

  it('uses the preview resolver for replacement text', () => {
    const view = buildOverlayView({
      text,
      states: [state(span('Mette', text, 'PERSON'))],
      manuals: [],
      resolver: () => 'Anna',
      fresh: new Set(),
      label,
    });
    expect(view.tokens[0]).toBe('Anna');
    expect(view.result[0].html).toContain('Anna');
  });

  it('handles multi-byte text offsets', () => {
    const t = 'Hej Søren Åkjær, ring til +45 28 71 40 93';
    const view = buildOverlayView({
      text: t,
      states: [state(span('Søren Åkjær', t, 'PERSON')), state(span('+45 28 71 40 93', t, 'PHONE'))],
      manuals: [],
      resolver: null,
      fresh: new Set(),
      label,
    });
    expect(view.original[0].html).toContain('Søren Åkjær</span>');
    expect(view.result[0].html).toContain('[PHONE_1]');
  });
});
