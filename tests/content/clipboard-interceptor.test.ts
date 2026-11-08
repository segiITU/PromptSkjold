/** @jest-environment jsdom */

import { ClipboardInterceptor } from '../../src/content/clipboard-interceptor';
import type { ClipboardInterceptorOptions } from '../../src/content/clipboard-interceptor';
import type { ResolveResult } from '../../src/shared/placeholder-resolver';

const SOURCE = 'pg-clipboard-intercept';

const NO_MATCHES: ResolveResult = { matches: [], deAnonText: '' };

function makeMatchResult(deAnonText: string): ResolveResult {
  return {
    matches: [
      {
        start: 0,
        end: 11,
        matchText: '[PERSON_1]',
        originalText: 'Alice',
        styleKey: 'person',
        kind: 'placeholder',
      },
    ],
    deAnonText,
  };
}

describe('ClipboardInterceptor', () => {
  const originalAttachShadow = HTMLElement.prototype.attachShadow;
  let interceptors: ClipboardInterceptor[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    jest
      .spyOn(HTMLElement.prototype, 'attachShadow')
      .mockImplementation(function attachOpenShadow(
        this: HTMLElement,
        init: ShadowRootInit,
      ): ShadowRoot {
        return originalAttachShadow.call(this, { ...init, mode: 'open' });
      });
  });

  afterEach(() => {
    for (const interceptor of interceptors) interceptor.stop();
    interceptors = [];
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createInterceptor(opts: ClipboardInterceptorOptions): ClipboardInterceptor {
    const interceptor = new ClipboardInterceptor(opts);
    interceptors.push(interceptor);
    return interceptor;
  }

  function getToastHost(): HTMLElement | null {
    return document.getElementById('pg-clipboard-toast-host');
  }

  async function flushCopyPipeline(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('shows a toast when the resolver returns at least one match', async () => {
    const interceptor = createInterceptor({
      resolve: (text) => makeMatchResult(text.replace('[PERSON_1]', 'Alice')),
    });
    interceptor.start();
    await interceptor.handleIntercepted('Hello [PERSON_1]', 'req-1');
    expect(getToastHost()).not.toBeNull();
  });

  it('does NOT show a toast when the resolver returns no matches', async () => {
    const interceptor = createInterceptor({
      resolve: () => NO_MATCHES,
    });
    interceptor.start();
    await interceptor.handleIntercepted('plain text', 'req-1');
    expect(getToastHost()).toBeNull();
  });

  it('disposes the previous toast when a new copy arrives (singleton)', async () => {
    const interceptor = createInterceptor({
      resolve: (text) => makeMatchResult(text + '!'),
    });
    interceptor.start();
    await interceptor.handleIntercepted('first', 'req-1');
    const firstHost = getToastHost();
    expect(firstHost).not.toBeNull();
    await interceptor.handleIntercepted('second', 'req-2');
    expect(document.querySelectorAll('#pg-clipboard-toast-host').length).toBe(1);
  });

  it('writes originals directly without exposing them through page messages', async () => {
    const postSpy = jest.spyOn(window, 'postMessage');
    const interceptor = createInterceptor({
      resolve: () => makeMatchResult('Hello Alice'),
    });
    interceptor.start();
    await interceptor.handleIntercepted('Hello [PERSON_1]', 'req-42');

    const btn = getToastHost()?.shadowRoot?.querySelector('.pg-toast-btn') as HTMLButtonElement;
    btn.click();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello Alice');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('drops messages that do not match the source field', async () => {
    const resolve = jest.fn();
    const interceptor = createInterceptor({
      resolve: resolve as unknown as () => ResolveResult,
    });
    interceptor.start();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { source: 'someone-else', kind: 'WRITE_INTERCEPTED', text: 'x', requestId: '1' },
      }),
    );
    await Promise.resolve();
    expect(resolve).not.toHaveBeenCalled();
  });

  /** What a page script can do: it knows the message shape, but it cannot make the browser report a user gesture. */
  function forgedWrite(text = 'Hi [PERSON_1]'): void {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { source: SOURCE, kind: 'WRITE_INTERCEPTED', text, requestId: 'r1' },
      }),
    );
  }

  function setUserActivation(isActive: boolean | undefined): void {
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: isActive === undefined ? undefined : { isActive, hasBeenActive: isActive },
    });
  }

  afterEach(() => setUserActivation(undefined));

  it('processes valid WRITE_INTERCEPTED messages received via window message events while the user is active', async () => {
    setUserActivation(true);
    const interceptor = createInterceptor({
      resolve: (text) => makeMatchResult(text + '!'),
    });
    interceptor.start();
    forgedWrite();
    // Allow the awaited resolve() in handleIntercepted to settle.
    await flushCopyPipeline();
    expect(getToastHost()).not.toBeNull();
  });

  it.each([
    ['the user has not done anything', false],
    ['the browser does not report user activation', undefined],
  ])('ignores a page-reported write when %s, so a page cannot pop the restore toast by itself', async (_name, active) => {
    setUserActivation(active);
    const resolve = jest.fn(() => makeMatchResult('Hello Alice'));
    const interceptor = createInterceptor({ resolve });
    interceptor.start();
    forgedWrite('[PERSON_1] [PERSON_2]');
    await flushCopyPipeline();
    expect(resolve).not.toHaveBeenCalled();
    expect(getToastHost()).toBeNull();
  });

  it('triggers the toast pipeline from a bubble-phase copy DOM event', async () => {
    const interceptor = createInterceptor({
      resolve: () => makeMatchResult('Hello Alice'),
    });
    interceptor.start();

    const evt = new Event('copy', { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(evt, 'clipboardData', {
      value: { getData: (mime: string) => (mime === 'text/plain' ? 'Hello [PERSON_1]' : '') },
    });
    document.dispatchEvent(evt);

    await flushCopyPipeline();
    expect(getToastHost()).not.toBeNull();
  });

  it('falls back to the current selection for Ctrl+C / manual copy events', async () => {
    const resolve = jest.fn((text: string) =>
      makeMatchResult(text.replace('[PERSON_1]', 'Alice')),
    );
    jest.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Selected [PERSON_1]',
    } as Selection);

    const interceptor = createInterceptor({ resolve });
    interceptor.start();

    document.dispatchEvent(new Event('copy', { bubbles: true }) as ClipboardEvent);

    await flushCopyPipeline();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('Selected [PERSON_1]');
    expect(getToastHost()).not.toBeNull();
  });

  it('keeps manual selections with no resolver matches silent', async () => {
    jest.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Selected ordinary text',
    } as Selection);

    const interceptor = createInterceptor({
      resolve: () => NO_MATCHES,
    });
    interceptor.start();

    document.dispatchEvent(new Event('copy', { bubbles: true }) as ClipboardEvent);

    await flushCopyPipeline();
    expect(getToastHost()).toBeNull();
  });

  it('on copy-event Replace, calls navigator.clipboard.writeText with the de-anonymized text', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const interceptor = createInterceptor({
      resolve: () => makeMatchResult('Hello Alice'),
    });
    interceptor.start();

    const evt2 = new Event('copy', { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(evt2, 'clipboardData', {
      value: { getData: (mime: string) => (mime === 'text/plain' ? 'Hello [PERSON_1]' : '') },
    });
    document.dispatchEvent(evt2);
    await flushCopyPipeline();

    const btn = getToastHost()?.shadowRoot?.querySelector('.pg-toast-btn') as HTMLButtonElement;
    btn.click();
    expect(writeText).toHaveBeenCalledWith('Hello Alice');
  });

  it('a manual copy supersedes a pending native-copy toast and uses the manual replace path', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    jest.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Manual [PERSON_1]',
    } as Selection);

    const interceptor = createInterceptor({
      resolve: (text) => makeMatchResult(text.replace('[PERSON_1]', 'Alice')),
    });
    interceptor.start();

    await interceptor.handleIntercepted('Native [PERSON_1]', 'req-1');
    const nativeHost = getToastHost();
    expect(nativeHost).not.toBeNull();

    document.dispatchEvent(new Event('copy', { bubbles: true }) as ClipboardEvent);
    await flushCopyPipeline();

    expect(document.querySelectorAll('#pg-clipboard-toast-host').length).toBe(1);
    expect(getToastHost()).not.toBe(nativeHost);

    const btn = getToastHost()?.shadowRoot?.querySelector('.pg-toast-btn') as HTMLButtonElement;
    btn.click();
    expect(writeText).toHaveBeenCalledWith('Manual Alice');
  });

  it('a native copy supersedes a pending manual-copy toast without a page-visible reply', async () => {
    const postSpy = jest.spyOn(window, 'postMessage');
    jest.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Manual [PERSON_1]',
    } as Selection);

    const interceptor = createInterceptor({
      resolve: (text) => makeMatchResult(text.replace('[PERSON_1]', 'Alice')),
    });
    interceptor.start();

    document.dispatchEvent(new Event('copy', { bubbles: true }) as ClipboardEvent);
    await flushCopyPipeline();
    const manualHost = getToastHost();
    expect(manualHost).not.toBeNull();

    await interceptor.handleIntercepted('Native [PERSON_1]', 'req-2');
    expect(document.querySelectorAll('#pg-clipboard-toast-host').length).toBe(1);
    expect(getToastHost()).not.toBe(manualHost);

    const btn = getToastHost()?.shadowRoot?.querySelector('.pg-toast-btn') as HTMLButtonElement;
    btn.click();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Native Alice');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('does not restore an older copy after a newer plain-text copy', async () => {
    const interceptor = createInterceptor({
      resolve: text => text.includes('[PERSON_1]') ? makeMatchResult('Alice') : NO_MATCHES,
    });
    interceptor.start();
    await interceptor.handleIntercepted('[PERSON_1]', 'old');
    const oldButton = getToastHost()!.shadowRoot!.querySelector('.pg-toast-btn') as HTMLButtonElement;
    await interceptor.handleIntercepted('new ordinary text', 'new');
    oldButton.click();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(getToastHost()).toBeNull();
  });

  it('ignores a late resolver result superseded by another copy', async () => {
    let resolveOld!: (result: ResolveResult) => void;
    const interceptor = createInterceptor({
      resolve: text => text === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : NO_MATCHES,
    });
    interceptor.start();
    const old = interceptor.handleIntercepted('old', 'old');
    await interceptor.handleIntercepted('new', 'new');
    resolveOld(makeMatchResult('Alice'));
    await old;
    expect(getToastHost()).toBeNull();
  });

  it('does not prevent default copy behavior for form-field text with no matches', async () => {
    const interceptor = createInterceptor({
      resolve: () => NO_MATCHES,
    });
    interceptor.start();

    const input = document.createElement('input');
    input.value = 'ordinary form text';
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(0, input.value.length);

    const evt = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(evt, 'clipboardData', {
      value: { getData: (mime: string) => (mime === 'text/plain' ? input.value : '') },
    });
    input.dispatchEvent(evt);

    await flushCopyPipeline();
    expect(evt.defaultPrevented).toBe(false);
    expect(getToastHost()).toBeNull();
  });

  it('respects setEnabled(false) — no toast is created and any open toast is disposed', async () => {
    const interceptor = createInterceptor({
      resolve: () => makeMatchResult('x'),
    });
    interceptor.start();
    await interceptor.handleIntercepted('Hi [PERSON_1]', 'r1');
    expect(getToastHost()).not.toBeNull();
    interceptor.setEnabled(false);
    expect(getToastHost()).toBeNull();
    await interceptor.handleIntercepted('Hi [PERSON_1]', 'r2');
    expect(getToastHost()).toBeNull();
  });

  it('ignores both WRITE_INTERCEPTED and copy DOM events while disabled', async () => {
    const resolve = jest.fn(() => makeMatchResult('Hello Alice'));
    jest.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Selected [PERSON_1]',
    } as Selection);

    const interceptor = createInterceptor({
      resolve,
      enabled: false,
    });
    interceptor.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          source: SOURCE,
          kind: 'WRITE_INTERCEPTED',
          text: 'Hello [PERSON_1]',
          requestId: 'r-disabled',
        },
      }),
    );
    document.dispatchEvent(new Event('copy', { bubbles: true }) as ClipboardEvent);
    await flushCopyPipeline();

    expect(resolve).not.toHaveBeenCalled();
    expect(getToastHost()).toBeNull();
  });
});
