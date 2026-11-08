/** @jest-environment jsdom */

import type { OffscreenOperation } from '../../src/shared/offscreen-protocol';

jest.mock('../../src/offscreen/debug', () => ({ debugLog: jest.fn(), initDebugFlag: jest.fn() }));
jest.mock('../../src/offscreen/detection', () => ({
  detectWithExternalNer: jest.fn(),
  getNerStatus: jest.fn(() => ({ mode: 'off', state: 'unavailable' })),
}));
jest.mock('../../src/offscreen/ocr-handler', () => ({ runOcr: jest.fn(), runRedactPdf: jest.fn() }));

type Listener = (message: unknown, sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => boolean;
const request: OffscreenOperation = { type: 'DETECT_PII', payload: { requestId: 'scan-1', text: 'Private content', config: { ner_provider: 'off' } } };
const envelope = (payload: OffscreenOperation) => ({ type: 'OFFSCREEN_REQUEST', payload });
const worker = () => ({ id: 'test', url: chrome.runtime.getURL('background/service-worker.js') });
const tab = () => ({ id: 'test', url: 'https://chatgpt.com/', tab: { id: 1 } as chrome.tabs.Tab });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('offscreen worker-only request routing', () => {
  let listener: Listener;
  let detect: jest.Mock;
  let runOcr: jest.Mock;
  let runRedactPdf: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    Object.assign(chrome.runtime, {
      id: 'test',
      onMessage: { addListener: jest.fn((value: Listener) => { listener = value; }) },
    });
    const detection = await import('../../src/offscreen/detection');
    detect = detection.detectWithExternalNer as jest.Mock;
    detect.mockResolvedValue({ spans: [], nerMs: 2 });
    const ocr = await import('../../src/offscreen/ocr-handler');
    runOcr = ocr.runOcr as jest.Mock;
    runRedactPdf = ocr.runRedactPdf as jest.Mock;
    await import('../../src/offscreen/offscreen');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each<OffscreenOperation>([
    request,
    { type: 'OCR_IMAGE', payload: { requestId: 'image', dataUrl: 'data:image/png;base64,AA==' } },
    { type: 'REDACT_PDF', payload: { requestId: 'pdf', dataUrl: 'data:application/pdf;base64,AA==', items: ['Private'] } },
    { type: 'GET_NER_STATUS' },
    { type: 'OFFSCREEN_PING' },
    { type: 'CANCEL_DETECTION', payload: { requestId: 'scan-1' } },
  ])('ignores public $type broadcasts even with a worker sender', operation => {
    const respond = jest.fn();
    expect(listener(operation, worker(), respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
    expect(runRedactPdf).not.toHaveBeenCalled();
  });

  test.each([
    ['content tab', () => tab()],
    ['another extension', () => ({ id: 'other', url: chrome.runtime.getURL('background/service-worker.js') })],
    ['popup', () => ({ id: 'test', url: chrome.runtime.getURL('popup/popup.html') })],
    ['offscreen document', () => ({ id: 'test', url: chrome.runtime.getURL('offscreen/offscreen.html') })],
  ] as const)('rejects an envelope from %s', (_name, sender) => {
    const respond = jest.fn();
    expect(listener(envelope(request), sender(), respond)).toBe(false);
    expect(detect).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  test('the public broadcast does no work and the configured worker envelope executes exactly once', async () => {
    const respond = jest.fn();
    listener(request, tab(), respond);
    expect(listener(envelope(request), worker(), respond)).toBe(true);
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledWith('Private content', { ner_provider: 'off' }, expect.any(AbortSignal));
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({
      type: 'PII_RESULT', payload: { requestId: 'scan-1', spans: [], timings: { totalMs: expect.any(Number), nerMs: 2, nerCoverage: undefined } },
    });
  });

  test('a pipeline exception is a failure, never a successful empty result', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    detect.mockRejectedValue(new Error('WASM unavailable'));
    const respond = jest.fn();
    listener(envelope(request), worker(), respond);
    await flush();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({ type: 'DETECTION_FAILED', payload: { requestId: 'scan-1', message: 'WASM unavailable' } });
  });

  test('worker cancellation aborts exactly the owned operation; a public cancel cannot abort it', async () => {
    let signal!: AbortSignal;
    detect.mockImplementation((_text, _config, value: AbortSignal) => {
      signal = value;
      return new Promise((_resolve, reject) => value.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError'))));
    });
    const response = jest.fn();
    listener(envelope(request), worker(), response);
    const cancel: OffscreenOperation = { type: 'CANCEL_DETECTION', payload: { requestId: 'scan-1' } };
    const acknowledgment = jest.fn();
    listener(cancel, tab(), acknowledgment);
    expect(signal.aborted).toBe(false);
    listener(envelope(cancel), worker(), acknowledgment);
    await flush();
    expect(signal.aborted).toBe(true);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(acknowledgment).toHaveBeenCalledWith({ type: 'DETECTION_CANCELED', payload: { requestId: 'scan-1' } });
    expect(response).toHaveBeenCalledWith({ type: 'DETECTION_CANCELED', payload: { requestId: 'scan-1' } });
  });

  test('cancellation received before detection prevents inference', () => {
    listener(envelope({ type: 'CANCEL_DETECTION', payload: { requestId: 'scan-1' } }), worker(), jest.fn());
    const respond = jest.fn();
    expect(listener(envelope(request), worker(), respond)).toBe(false);
    expect(detect).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith({ type: 'DETECTION_CANCELED', payload: { requestId: 'scan-1' } });
  });

  test('only a worker envelope can receive the readiness pong', () => {
    const respond = jest.fn();
    listener(envelope({ type: 'OFFSCREEN_PING' }), worker(), respond);
    expect(respond).toHaveBeenCalledWith({ type: 'OFFSCREEN_PONG' });
  });
});
