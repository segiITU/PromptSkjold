/** @jest-environment jsdom */

import {
  SubmitInterceptor,
  readComposerText,
  type SubmitInterceptorCallbacks,
} from '../../src/content/submit-interceptor';
import type { SiteAdapter } from '../../src/content/site-adapters/adapter-interface';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

const EMAIL_SPAN = {
  start: 6,
  end: 21,
  entity_type: 'EMAIL',
  score: 0.95,
  text: 'peter@example.com',
  source: 'regex',
};

describe('SubmitInterceptor', () => {
  let textarea: HTMLTextAreaElement;
  let sendButton: HTMLButtonElement;
  let adapter: SiteAdapter;
  let sendClicks: jest.Mock;
  let interceptor: SubmitInterceptor | null;

  const makeCallbacks = (): SubmitInterceptorCallbacks & Record<string, jest.Mock> => ({
    onAnalyzing: jest.fn(),
    onNoPii: jest.fn(),
    onPiiDetected: jest.fn(),
    onError: jest.fn(),
    onCanceled: jest.fn(),
    onComposerMissing: jest.fn(),
  });

  const mockDetection = (spans: unknown[]) => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      type: 'PII_RESULT',
      payload: { spans, timings: { totalMs: 1 } },
    });
  };

  const enter = (init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true,
      ...init,
    });
    textarea.dispatchEvent(event);
    return event;
  };

  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  beforeEach(() => {
    jest.resetAllMocks();
    document.body.replaceChildren();
    textarea = document.createElement('textarea');
    sendButton = document.createElement('button');
    sendButton.setAttribute('data-testid', 'send-button');
    document.body.append(textarea, sendButton);
    // Stands in for the page's own submit handler.
    sendClicks = jest.fn();
    sendButton.addEventListener('click', sendClicks);

    adapter = {
      name: 'test',
      sendButtonSelectors: ['button[data-testid="send-button"]'],
      getInputElement: () => textarea,
      getResponseElements: () => [],
      insertText: jest.fn((el: HTMLElement, text: string) => {
        (el as HTMLTextAreaElement).value = text;
      }),
      observeResponses: jest.fn() as unknown as SiteAdapter['observeResponses'],
    };
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ pg_settings: DEFAULT_SETTINGS });
    interceptor = null;
  });

  afterEach(() => {
    interceptor?.stop();
  });

  const start = (callbacks = makeCallbacks()) => {
    interceptor = new SubmitInterceptor(adapter, callbacks);
    interceptor.start();
    return callbacks;
  };

  it('holds Enter before page listeners see it and reports detected PII without sending', async () => {
    const callbacks = start();
    const pageHandler = jest.fn();
    document.addEventListener('keydown', pageHandler, true);
    textarea.value = 'Email peter@example.com now';
    mockDetection([EMAIL_SPAN]);

    const event = enter();
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(pageHandler).not.toHaveBeenCalled();
    expect(callbacks.onPiiDetected).toHaveBeenCalledWith(
      'Email peter@example.com now',
      [EMAIL_SPAN],
      { totalMs: 1 },
    );
    expect(sendClicks).not.toHaveBeenCalled();
    document.removeEventListener('keydown', pageHandler, true);
  });

  it('sends through the site send button once the scan finds nothing', async () => {
    const callbacks = start();
    textarea.value = 'Write a poem about the sea';
    mockDetection([]);

    enter();
    await new Promise((r) => setTimeout(r, 20));

    expect(callbacks.onNoPii).toHaveBeenCalled();
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it('does not intercept the interceptor\'s own re-submit click', async () => {
    start();
    textarea.value = 'Hello there friend';
    mockDetection([]);

    enter();
    await new Promise((r) => setTimeout(r, 20));

    // Exactly one detection request: the bypassed click was not rescanned.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it('lets Enter through when the composer is empty', () => {
    start();
    textarea.value = '   ';
    const event = enter();
    expect(event.defaultPrevented).toBe(false);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores Shift+Enter and IME composition', () => {
    start();
    textarea.value = 'Line one';
    expect(enter({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(enter({ isComposing: true }).defaultPrevented).toBe(false);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('intercepts a click on the send button', async () => {
    const callbacks = start();
    textarea.value = 'Email peter@example.com now';
    mockDetection([EMAIL_SPAN]);

    sendButton.click();
    await flush();

    expect(sendClicks).not.toHaveBeenCalled();
    expect(callbacks.onPiiDetected).toHaveBeenCalled();
  });

  it('replaces the composer text with the anonymized text and then sends', async () => {
    start();
    textarea.value = 'Email peter@example.com now';
    mockDetection([EMAIL_SPAN]);

    enter();
    await flush();
    interceptor!.submitReplaced('Email [EMAIL_1] now');
    await new Promise((r) => setTimeout(r, 20));

    expect(textarea.value).toBe('Email [EMAIL_1] now');
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it('keeps the text and does not send when the review is abandoned', async () => {
    start();
    textarea.value = 'Email peter@example.com now';
    mockDetection([EMAIL_SPAN]);

    enter();
    await flush();
    interceptor!.abandon();
    await new Promise((r) => setTimeout(r, 20));

    expect(textarea.value).toBe('Email peter@example.com now');
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('fails closed when detection errors, then sends on an immediate retry', async () => {
    const callbacks = start();
    textarea.value = 'Email peter@example.com now';
    (chrome.runtime.sendMessage as jest.Mock).mockRejectedValue(new Error('offscreen down'));

    enter();
    await new Promise((r) => setTimeout(r, 20));
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('NOT sent'));
    expect(sendClicks).not.toHaveBeenCalled();

    enter();
    await new Promise((r) => setTimeout(r, 20));
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it('swallows repeated Enter presses while a review is in flight', async () => {
    start();
    textarea.value = 'Email peter@example.com now';
    mockDetection([EMAIL_SPAN]);

    enter();
    const second = enter();
    await flush();

    expect(second.defaultPrevented).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('holds typed edits made while a clean scan is pending', async () => {
    const callbacks = start();
    let answer!: (value: unknown) => void;
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    textarea.value = 'Write a poem';
    enter();
    await flush();
    textarea.value = 'Email secret@example.com';
    answer({ type: 'PII_RESULT', payload: { spans: [] } });
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
    expect(callbacks.onNoPii).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });

  it('scans a second prompt immediately after the first automatic send', async () => {
    start();
    mockDetection([]);
    textarea.value = 'Write a poem';
    enter();
    await flush();
    expect(sendClicks).toHaveBeenCalledTimes(1);
    mockDetection([EMAIL_SPAN]);
    textarea.value = 'Email peter@example.com now';
    enter();
    await flush();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it.each([
    { type: 'DETECTION_FAILED', payload: { requestId: 'x', message: 'WASM unavailable' } },
    { type: 'PII_RESULT', payload: { spans: [] }, error: 'offscreen failed' },
    { type: 'PII_RESULT', payload: {} },
  ])('holds failed/malformed detection responses: $type', async response => {
    const callbacks = start();
    textarea.value = 'Email secret@example.com';
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(response);
    enter();
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
    expect(callbacks.onNoPii).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('NOT sent'));
  });

  it('does not apply the explicit failure retry to different text', async () => {
    start();
    textarea.value = 'first private message';
    (chrome.runtime.sendMessage as jest.Mock).mockRejectedValue(new Error('offline'));
    enter();
    await flush();
    textarea.value = 'a different secret';
    enter();
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('revokes old failure permission after a successful send of the same text', async () => {
    start();
    textarea.value = 'same private message';
    (chrome.runtime.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    enter();
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
    mockDetection([]);
    enter();
    await flush();
    expect(sendClicks).toHaveBeenCalledTimes(1);
    (chrome.runtime.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('new failure'));
    enter();
    await flush();
    expect(sendClicks).toHaveBeenCalledTimes(1);
  });

  it('revalidates the composer after waiting for a disabled send control', async () => {
    start();
    textarea.value = 'Write a poem';
    sendButton.disabled = true;
    mockDetection([]);
    enter();
    await flush();
    textarea.value = 'secret@example.com';
    sendButton.disabled = false;
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('holds a clean result after the composer is replaced', async () => {
    start();
    let answer!: (value: unknown) => void;
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    textarea.value = 'Write a poem';
    enter();
    await flush();
    const replacement = document.createElement('textarea');
    textarea.replaceWith(replacement);
    textarea = replacement;
    answer({ type: 'PII_RESULT', payload: { spans: [] } });
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('does not overwrite a draft changed during review', async () => {
    start();
    textarea.value = 'Email peter@example.com';
    mockDetection([EMAIL_SPAN]);
    enter();
    await flush();
    textarea.value = 'a new draft';
    interceptor!.submitReplaced('Email [EMAIL_1]');
    await flush();
    expect(textarea.value).toBe('a new draft');
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('holds partial-coverage zero-findings results instead of claiming a clean scan', async () => {
    start();
    textarea.value = 'long private message';
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ type: 'PII_RESULT', payload: { spans: [], timings: {
      totalMs: 1, nerCoverage: { mode: 'partial', totalChunks: 2, scannedChunks: 1, skippedNonProse: 0, budgetExhausted: true },
    } } });
    enter();
    await flush();
    expect(sendClicks).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    start();
    interceptor!.setEnabled(false);
    textarea.value = 'Email peter@example.com now';
    expect(enter().defaultPrevented).toBe(false);
  });
});

describe('readComposerText', () => {
  it('joins block children with single newlines (rich editors)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>first</p><p>second</p>';
    expect(readComposerText(div)).toBe('first\nsecond');
  });

  it('reads textarea values verbatim', () => {
    const ta = document.createElement('textarea');
    ta.value = 'a\nb';
    expect(readComposerText(ta)).toBe('a\nb');
  });
});
