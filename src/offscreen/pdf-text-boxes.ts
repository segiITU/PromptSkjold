import type { OcrWord } from '../ocr/types';

interface TextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  dir?: string;
}

function multiply(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/**
 * Matching still uses words, but each word covers its whole PDF text item.
 * PDF.js does not expose per-glyph positions here: dividing a proportional
 * font's width by character count can leave part of a selected word visible.
 * Cover the transformed run, with generous font/bearing margins, instead.
 */
export function textLayerWords(items: TextItem[], viewportTransform: number[], scale: number): OcrWord[] {
  const words: OcrWord[] = [];
  for (const item of items) {
    const runLength = item.dir === 'ttb' ? item.height : item.width;
    if (!item.str || item.transform?.length !== 6 || !runLength || !Number.isFinite(runLength)) continue;
    const t = multiply(viewportTransform, item.transform);
    if (!t.every(Number.isFinite)) continue;
    const xScale = Math.hypot(t[0], t[1]);
    const fontPx = Math.hypot(t[2], t[3]);
    if (xScale === 0 || fontPx === 0) continue;
    const vertical = item.dir === 'ttb';
    const dx = (vertical ? -t[1] : t[0]) / xScale;
    const dy = (vertical ? t[0] : t[1]) / xScale;
    const emX = vertical ? -t[3] : t[2];
    const emY = vertical ? t[2] : t[3];
    const advance = Math.abs(runLength * scale);
    const points: Array<[number, number]> = [];
    for (const along of [-fontPx * 0.5, advance + fontPx * 0.5]) {
      for (const em of [-1.5, 1.5]) {
        points.push([t[4] + dx * along + emX * em, t[5] + dy * along + emY * em]);
      }
    }
    const box = {
      x0: Math.min(...points.map(([x]) => x)), y0: Math.min(...points.map(([, y]) => y)),
      x1: Math.max(...points.map(([x]) => x)), y1: Math.max(...points.map(([, y]) => y)),
    };
    for (const match of item.str.matchAll(/\S+/g)) {
      words.push({ text: match[0], confidence: 100, box });
    }
  }
  return words;
}
