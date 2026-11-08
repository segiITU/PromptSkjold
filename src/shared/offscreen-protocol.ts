import type { CancelDetectionRequest, DetectPiiRequest, GetNerStatusRequest, OcrImageRequest, OffscreenPingRequest, RedactPdfRequest } from './message-types';

export type OffscreenOperation = DetectPiiRequest | CancelDetectionRequest | GetNerStatusRequest | OcrImageRequest | RedactPdfRequest | OffscreenPingRequest;
export interface OffscreenRequest { type: 'OFFSCREEN_REQUEST'; payload: OffscreenOperation }

/** Worker-only envelope: public runtime broadcasts must never start offscreen work directly. */
export function sendOffscreenRequest(request: OffscreenOperation): Promise<any> {
  return chrome.runtime.sendMessage({ type: 'OFFSCREEN_REQUEST', payload: request } satisfies OffscreenRequest);
}

export function isWorkerOffscreenRequest(value: unknown, sender: chrome.runtime.MessageSender): value is OffscreenRequest {
  const request = value as OffscreenRequest | undefined;
  return request?.type === 'OFFSCREEN_REQUEST'
    && !!request.payload && typeof request.payload === 'object'
    && ['DETECT_PII', 'CANCEL_DETECTION', 'GET_NER_STATUS', 'OCR_IMAGE', 'REDACT_PDF', 'OFFSCREEN_PING'].includes(request.payload.type)
    && sender.id === chrome.runtime.id
    && !sender.tab
    && (!sender.url || sender.url === chrome.runtime.getURL('background/service-worker.js'));
}
