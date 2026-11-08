/** Images with more pixels than this are not decoded: 40 megapixels is 160 MB of RGBA before the canvas copy. */
export const MAX_IMAGE_PIXELS = 40_000_000;

const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const text = (b: Uint8Array, at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length));

function jpeg(bytes: Uint8Array): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; } // fill byte
    // Start-of-frame markers carry the size; C4, C8 and CC share their range but do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    at += 2 + u16be(bytes, at + 2);
  }
  return null;
}

function webp(bytes: Uint8Array): { width: number; height: number } | null {
  const chunk = text(bytes, 12, 4);
  if (chunk === 'VP8X') return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  if (chunk === 'VP8L') {
    const bits = u32le(bytes, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  return null;
}

/**
 * The pixel size an image declares in its header, or null when the format is not
 * recognised or the header is cut short. Reading it costs nothing, so it can run
 * before the browser is asked to decode a file that may claim a huge size.
 */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && text(bytes, 1, 3) === 'PNG') {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (bytes.length >= 10 && text(bytes, 0, 3) === 'GIF') return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  if (bytes.length >= 26 && text(bytes, 0, 2) === 'BM') {
    // A positive height is a bottom-up bitmap, a negative one top-down; the old 12-byte header has 16-bit fields.
    if (u32le(bytes, 14) === 12) return { width: u16le(bytes, 18), height: u16le(bytes, 20) };
    return { width: Math.abs(u32le(bytes, 18) | 0), height: Math.abs(u32le(bytes, 22) | 0) };
  }
  if (bytes.length >= 30 && text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') return webp(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
  return null;
}
