import type { GrayImage } from './types';

/** Longest side allowed into the engine; larger inputs are shrunk. */
export const MAX_SIDE = 3500;
/** Glyph height (px) the Danish models read best, from the OCR comparison. */
export const TARGET_GLYPH_HEIGHT = 24;

/** RGBA pixels (ImageData layout) to one grey channel. */
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    // Transparent pixels count as white paper.
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    data[i] = lum * a + 255 * (1 - a);
  }
  return { width, height, data };
}

/**
 * Median height of the dark blobs that look like letters. Returns 0 when the
 * page has too little text to measure. Uses a local-mean threshold so scans
 * with uneven lighting still work.
 */
export function medianGlyphHeight(img: GrayImage): number {
  const { width: w, height: h, data } = img;
  if (w < 8 || h < 8) return 0;

  // Integral image for a local mean.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 40));
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        integral[y1 * (w + 1) + x1] -
        integral[y0 * (w + 1) + x1] -
        integral[y1 * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (data[y * w + x] < mean - 15) ink[y * w + x] = 1;
    }
  }

  // Connected components (8-neighbour) by union-find, tracking bounding boxes.
  const parent = new Int32Array(w * h).fill(-1);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ink[i]) continue;
      parent[i] = i;
      const neighbours = [i - 1, i - w, i - w - 1, i - w + 1];
      const valid = [x > 0, y > 0, x > 0 && y > 0, x < w - 1 && y > 0];
      for (let n = 0; n < 4; n++) {
        if (!valid[n]) continue;
        const j = neighbours[n];
        if (parent[j] === -1) continue;
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const minY = new Map<number, number>();
  const maxY = new Map<number, number>();
  const area = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (parent[i] === -1) continue;
      const root = find(i);
      minY.set(root, Math.min(minY.get(root) ?? y, y));
      maxY.set(root, Math.max(maxY.get(root) ?? y, y));
      area.set(root, (area.get(root) ?? 0) + 1);
    }
  }
  const heights: number[] = [];
  for (const [root, top] of minY) {
    const height = (maxY.get(root) as number) - top + 1;
    if (height >= 6 && height < h * 0.2 && (area.get(root) as number) >= 12) heights.push(height);
  }
  if (heights.length < 20) return 0;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

/** Bilinear resize of a grey image. */
export function resizeGray(img: GrayImage, factor: number): GrayImage {
  const width = Math.max(1, Math.round(img.width * factor));
  const height = Math.max(1, Math.round(img.height * factor));
  const out = new Uint8ClampedArray(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const top = img.data[y0 * img.width + x0] * (1 - wx) + img.data[y0 * img.width + x1] * wx;
      const bottom = img.data[y1 * img.width + x0] * (1 - wx) + img.data[y1 * img.width + x1] * wx;
      out[y * width + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return { width, height, data: out };
}

/**
 * Scale so letters are about the size the engine reads best, and cap the
 * longest side. No binarisation: the comparison showed it hurts Tesseract.
 * Deskew is not implemented yet (see docs/OCR.md).
 */
export function prepareForOcr(img: GrayImage): { image: GrayImage; scale: number } {
  let out = img;
  const glyph = medianGlyphHeight(out);
  if (glyph > 0) {
    const factor = TARGET_GLYPH_HEIGHT / glyph;
    if (factor > 1.15 || factor < 0.7) {
      out = resizeGray(out, Math.min(3, Math.max(0.35, factor)));
    }
  }
  const longest = Math.max(out.width, out.height);
  if (longest > MAX_SIDE) out = resizeGray(out, MAX_SIDE / longest);
  return { image: out, scale: out.width / img.width };
}
