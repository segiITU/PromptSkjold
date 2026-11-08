import { MAX_IMAGE_PIXELS, imageDimensions } from '../../src/files/image-size';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

describe('imageDimensions', () => {
  test('PNG', () => {
    const png = bytes([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], ascii('IHDR'), [0, 0, 0x03, 0xe8], [0, 0, 0x07, 0xd0]);
    expect(imageDimensions(png)).toEqual({ width: 1000, height: 2000 });
  });

  test('GIF', () => {
    expect(imageDimensions(bytes(ascii('GIF89a'), [0x20, 0x03, 0x58, 0x02], [0, 0, 0]))).toEqual({ width: 800, height: 600 });
  });

  test('BMP, bottom-up and top-down', () => {
    const header = (height: number) => bytes(ascii('BM'), le32(70), [0, 0, 0, 0], le32(54), le32(40), le32(300), le32(height), [1, 0, 24, 0]);
    expect(imageDimensions(header(200))).toEqual({ width: 300, height: 200 });
    expect(imageDimensions(header(-200))).toEqual({ width: 300, height: 200 });
  });

  test('JPEG: the size comes from the frame header after other segments', () => {
    const app0 = bytes([0xff, 0xe0], be16(16), new Array(14).fill(0));
    const sof = bytes([0xff, 0xc2], be16(17), [8], be16(4000), be16(3000), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(imageDimensions(bytes([0xff, 0xd8], Array.from(app0), Array.from(sof)))).toEqual({ width: 3000, height: 4000 });
  });

  test.each([
    ['VP8X', [...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...[0x1f, 0x0f, 0], ...[0xff, 0x07, 0]], { width: 3872, height: 2048 }],
    ['VP8L', [...ascii('VP8L'), 5, 0, 0, 0, 0x2f, ...le32((99 | (49 << 14)) >>> 0), 0, 0, 0, 0, 0], { width: 100, height: 50 }],
    ['VP8 ', [...ascii('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...[0x40, 0x01], ...[0xf0, 0x00]], { width: 320, height: 240 }],
  ])('WebP %s', (_name, chunk, expected) => {
    expect(imageDimensions(bytes(ascii('RIFF'), [0, 0, 0, 0], ascii('WEBP'), chunk as number[]))).toEqual(expected);
  });

  test('anything else, or a cut-off header, is unknown', () => {
    expect(imageDimensions(new Uint8Array(0))).toBeNull();
    expect(imageDimensions(bytes(ascii('hello world, this is text'), new Array(10).fill(0)))).toBeNull();
    expect(imageDimensions(bytes([0x89, ...ascii('PNG')]))).toBeNull();
    expect(imageDimensions(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).toBeNull();
  });

  test('the limit is 40 megapixels', () => {
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000);
  });
});
