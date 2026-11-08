import { get } from 'svelte/store';
import {
  FEEDBACK_MAX_AGE_MS,
  getFeedbackLog,
  logFeedback,
  purgeExpiredFeedback,
} from '../../src/shared/storage';
import { OverlayModel } from '../../src/ui/overlay/overlay-model';
import type { FeedbackEntry, PiiSpan } from '../../src/shared/message-types';

const DAY = 24 * 60 * 60 * 1000;
const entry = (ageDays: number, extra: Record<string, unknown> = {}): FeedbackEntry =>
  ({ detectedType: 'PERSON', correctedType: 'NOT_PII', timestamp: Date.now() - ageDays * DAY, ...extra }) as FeedbackEntry;

/** chrome.storage.local backed by a plain object, so what is written can be read back. */
function fakeStorage(initial: unknown[]) {
  const store: Record<string, unknown> = { pg_feedback: initial };
  (chrome.storage.local.get as jest.Mock).mockImplementation(async (key: string) => ({ [key]: store[key] }));
  (chrome.storage.local.set as jest.Mock).mockImplementation(async (values: Record<string, unknown>) => void Object.assign(store, values));
  (chrome.storage.local.remove as jest.Mock).mockImplementation(async (key: string) => void delete store[key]);
  return store;
}

afterEach(() => {
  (chrome.storage.local.get as jest.Mock).mockReset().mockResolvedValue({});
  (chrome.storage.local.set as jest.Mock).mockReset().mockResolvedValue(undefined);
  (chrome.storage.local.remove as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('feedback log', () => {
  test('entries expire after 30 days', async () => {
    expect(FEEDBACK_MAX_AGE_MS).toBe(30 * DAY);
    const store = fakeStorage([entry(40), entry(29), entry(1)]);
    await logFeedback(entry(0));
    expect((store.pg_feedback as FeedbackEntry[]).map((e) => Math.round((Date.now() - e.timestamp) / DAY))).toEqual([29, 1, 0]);
  });

  test('neither the text around a correction nor the corrected value is stored, and both are removed from entries stored earlier', async () => {
    const store = fakeStorage([entry(2, { context: 'Hej Mette Hansen, CPR 010190-1234', text: 'Mette Hansen' })]);
    await logFeedback(entry(0, { context: 'Ring til Mette på 20 12 34 56', text: 'Mette' }));
    for (const stored of store.pg_feedback as Array<Record<string, unknown>>) {
      expect(stored).not.toHaveProperty('context');
      expect(stored).not.toHaveProperty('text');
    }
    expect(JSON.stringify(store)).not.toMatch(/010190|20 12 34 56/);
  });

  test('reading hides expired entries', async () => {
    fakeStorage([entry(60), entry(3)]);
    expect(await getFeedbackLog()).toHaveLength(1);
  });

  test('a purge rewrites the log only when something changed', async () => {
    const store = fakeStorage([entry(60), entry(3, { context: 'x' })]);
    await purgeExpiredFeedback();
    expect(store.pg_feedback).toHaveLength(1);
    expect(store.pg_feedback).not.toEqual(expect.arrayContaining([expect.objectContaining({ context: 'x' })]));

    (chrome.storage.local.set as jest.Mock).mockClear();
    await purgeExpiredFeedback();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('what the review reports about a correction', () => {
  test('retyping and dismissing send the type and the value, never the surrounding text', () => {
    const onFeedback = jest.fn();
    const text = 'Hej Mette Hansen, ring til mig';
    const span: PiiSpan = { start: 4, end: 16, entity_type: 'PERSON', score: 0.9, text: 'Mette Hansen', source: 'ner' };
    const model = new OverlayModel(text, [span], { onFeedback, onAddToAllowlist: jest.fn(), onEditDetails: jest.fn() } as never, 0.5);
    model.retype(0, 'ORGANIZATION');
    model.openDismissMenu(0, { top: 0, left: 0, width: 0, height: 0 } as never);
    model.confirmDismiss('none');
    expect(onFeedback).toHaveBeenCalled();
    for (const [sent] of onFeedback.mock.calls) {
      expect(sent).not.toHaveProperty('context');
      expect(sent).not.toHaveProperty('text');
      expect(JSON.stringify(sent)).not.toContain('ring til mig');
    }
    expect(get(model.spanStates)).toHaveLength(1);
  });
});
