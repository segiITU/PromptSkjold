import { coverageNotes, detectionFailed, requirePiiResult } from '../../src/shared/detection-result';

describe('detection response boundary', () => {
  test('only a successful result can represent an empty clean scan', () => {
    const result = { type: 'PII_RESULT', payload: { requestId: 'scan', spans: [] } };
    expect(requirePiiResult(result)).toBe(result);
  });

  test('an explicit failure cannot be interpreted as a clean result', () => {
    const result = detectionFailed('scan', new Error('WASM unavailable'));
    expect(result).toEqual({ type: 'DETECTION_FAILED', payload: { requestId: 'scan', message: 'WASM unavailable' } });
    expect(() => requirePiiResult(result)).toThrow('WASM unavailable');
  });

  test('legacy error-bearing PII_RESULT responses fail during mixed-version updates', () => {
    expect(() => requirePiiResult({ type: 'PII_RESULT', error: 'offscreen unavailable', payload: { spans: [] } })).toThrow('offscreen unavailable');
  });

  test.each([undefined, null, {}, { type: 'DETECTION_CANCELED' }, { type: 'PII_RESULT' }, { type: 'PII_RESULT', payload: {} }])(
    'rejects malformed or non-success result %p', value => {
      expect(() => requirePiiResult(value)).toThrow();
    },
  );

  test('partial coverage generates a visible limitation even with no findings', () => {
    expect(coverageNotes({ mode: 'partial', totalChunks: 10, scannedChunks: 1, skippedNonProse: 0, budgetExhausted: true })).toHaveLength(1);
    expect(coverageNotes()).toEqual([]);
    expect(coverageNotes({ mode: 'full', totalChunks: 1, scannedChunks: 1, skippedNonProse: 0, budgetExhausted: false })).toEqual([]);
  });
});
