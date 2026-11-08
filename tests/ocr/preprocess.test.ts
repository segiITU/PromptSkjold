import { medianGlyphHeight, prepareForOcr, resizeGray, rgbaToGray, MAX_SIDE } from '../../src/ocr/preprocess';
import type { GrayImage } from '../../src/ocr/types';

/** White page with rows of dark "letters" of a given height. */
function page(width: number, height: number, glyphHeight: number): GrayImage {
  const data = new Uint8ClampedArray(width * height).fill(255);
  const pitch = glyphHeight * 3;
  for (let top = 10; top + glyphHeight < height - 10; top += pitch) {
    for (let left = 10; left + 6 < width - 10; left += 12) {
      for (let y = top; y < top + glyphHeight; y++) {
        for (let x = left; x < left + 5; x++) data[y * width + x] = 20;
      }
    }
  }
  return { width, height, data };
}

describe('rgbaToGray', () => {
  test('converts colour to luminance and treats transparency as white', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const gray = rgbaToGray(rgba, 2, 1);
    expect(gray.data[0]).toBeCloseTo(76, 0);
    expect(gray.data[1]).toBe(255);
  });
});

describe('medianGlyphHeight', () => {
  test('measures letter height on a synthetic page', () => {
    expect(medianGlyphHeight(page(400, 300, 14))).toBe(14);
  });

  test('returns 0 for a blank page', () => {
    const blank = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200).fill(255) };
    expect(medianGlyphHeight(blank)).toBe(0);
  });
});

describe('prepareForOcr', () => {
  test('enlarges small text towards the target size', () => {
    const out = prepareForOcr(page(400, 300, 12)).image;
    expect(out.width).toBeGreaterThan(400);
  });

  test('leaves text of about the right size alone', () => {
    const out = prepareForOcr(page(400, 300, 24)).image;
    expect(out.width).toBe(400);
  });

  test('caps the longest side', () => {
    const big: GrayImage = { width: 5000, height: 100, data: new Uint8ClampedArray(5000 * 100).fill(255) };
    expect(prepareForOcr(big).image.width).toBeLessThanOrEqual(MAX_SIDE);
  });
});

describe('resizeGray', () => {
  test('keeps a flat image flat', () => {
    const flat = { width: 10, height: 10, data: new Uint8ClampedArray(100).fill(128) };
    const out = resizeGray(flat, 2);
    expect(out.width).toBe(20);
    expect(new Set(out.data)).toEqual(new Set([128]));
  });
});
