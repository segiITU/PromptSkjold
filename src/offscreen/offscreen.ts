import type {
  CancelDetectionRequest,
  DetectPiiRequest,
  DetectionCanceledResponse,
  GetNerStatusRequest,
  Message,
  OcrImageRequest,
  OcrResultResponse,
  RedactPdfRequest,
  RedactPdfResponse,
  NerStatusResponse,
  OffscreenPongResponse,
  PiiResultResponse,
} from '../shared/message-types';
import { debugLog, initDebugFlag } from './debug';
import { detectWithExternalNer, getNerStatus } from './detection';
import { runOcr, runRedactPdf } from './ocr-handler';
import { detectionFailed } from '../shared/detection-result';
import { isWorkerOffscreenRequest } from '../shared/offscreen-protocol';

initDebugFlag();

const activeDetections = new Map<string, AbortController>();
const canceledDetections = new Set<string>();

function canceledResponse(requestId: string): DetectionCanceledResponse {
  return {
    type: 'DETECTION_CANCELED',
    payload: { requestId },
  };
}

/**
 * Offscreen document — receives DETECT_PII messages from the service worker,
 * runs the WASM detection pipeline, and returns results.
 */
chrome.runtime.onMessage.addListener(
  (envelope: unknown, sender, sendResponse) => {
    if (!isWorkerOffscreenRequest(envelope, sender)) return false;
    const message = envelope.payload;
    if (message.type === 'OFFSCREEN_PING') {
      const pong: OffscreenPongResponse = { type: 'OFFSCREEN_PONG' };
      sendResponse(pong);
      return false;
    }

    if (message.type === 'CANCEL_DETECTION') {
      const { requestId } = (message as CancelDetectionRequest).payload;
      const activeDetection = activeDetections.get(requestId);
      if (activeDetection) {
        activeDetection.abort();
        activeDetections.delete(requestId);
      } else {
        canceledDetections.add(requestId);
        window.setTimeout(() => canceledDetections.delete(requestId), 300000);
      }
      sendResponse(canceledResponse(requestId));
      return false;
    }

    if (message.type === 'GET_NER_STATUS') {
      const { config } = (message as GetNerStatusRequest).payload ?? {};
      const response: NerStatusResponse = {
        type: 'NER_STATUS',
        payload: getNerStatus(config),
      };
      sendResponse(response);
      return false;
    }

    if (message.type === 'OCR_IMAGE') {
      const { requestId, dataUrl, config } = (message as OcrImageRequest).payload;
      const abortController = new AbortController();
      activeDetections.set(requestId, abortController);
      runOcr(requestId, dataUrl, config, abortController.signal)
        .then(sendResponse)
        .catch((err) => {
          console.error('[PG:offscreen] OCR error:', err);
          const canceled = abortController.signal.aborted || err?.name === 'AbortError';
          sendResponse({
            type: 'OCR_RESULT',
            payload: {
              requestId,
              status: 'failed',
              text: '',
              spans: [],
              boxes: [],
              meanConfidence: 0,
              ms: 0,
              message: canceled ? 'canceled' : String(err?.message ?? err),
            },
          } satisfies OcrResultResponse);
        })
        .finally(() => activeDetections.delete(requestId));
      return true;
    }

    if (message.type === 'REDACT_PDF') {
      const { requestId, dataUrl, items } = (message as RedactPdfRequest).payload;
      const abortController = new AbortController();
      activeDetections.set(requestId, abortController);
      runRedactPdf(requestId, dataUrl, items, abortController.signal)
        .then(sendResponse)
        .catch((err) => {
          console.error('[PG:offscreen] PDF redaction error:', err);
          sendResponse({
            type: 'REDACT_PDF_RESULT',
            payload: { requestId, status: 'failed', missed: items, pages: 0, message: String(err?.message ?? err) },
          } satisfies RedactPdfResponse);
        })
        .finally(() => activeDetections.delete(requestId));
      return true;
    }

    if (message.type !== 'DETECT_PII') return false;

    const { text, requestId, config } = (message as DetectPiiRequest).payload;
    if (canceledDetections.delete(requestId)) {
      sendResponse(canceledResponse(requestId));
      return false;
    }

    debugLog('[PG:offscreen] DETECT_PII received', {
      requestId,
      textLength: text.length,
      config,
    });
    const startTime = performance.now();
    const abortController = new AbortController();
    activeDetections.set(requestId, abortController);

    detectWithExternalNer(text, config, abortController.signal)
      .then(({ spans, nerMs, nerCoverage }) => {
        activeDetections.delete(requestId);
        const totalMs = Math.round(performance.now() - startTime);
        const response: PiiResultResponse = {
          type: 'PII_RESULT',
          payload: { requestId, spans, timings: { totalMs, nerMs, nerCoverage } },
        };
        sendResponse(response);
      })
      .catch((err) => {
        activeDetections.delete(requestId);
        if (abortController.signal.aborted || err?.name === 'AbortError') {
          sendResponse(canceledResponse(requestId));
          return;
        }

        console.error('[PG:offscreen] Detection error:', err);
        sendResponse(detectionFailed(requestId, err));
      });

    return true; // keep channel open for async response
  }
);

console.log('[PG:offscreen] Offscreen document ready');
