/** A decoded image reduced to one grey channel (0 = black, 255 = white). */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  /** 0..100, as reported by the engine. */
  confidence: number;
  /** Pixel box in the image that was recognised (after preprocessing). */
  box: OcrBox;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  /** Mean word confidence 0..100, 0 when nothing was read. */
  meanConfidence: number;
  engineId: string;
  ms: number;
}

/**
 * One text-recognition engine. Engines are interchangeable: the rest of the
 * extension only sees this interface, so a different model can be dropped in
 * by registering another implementation.
 */
export interface OcrEngine {
  readonly id: string;
  readonly label: string;
  /** Prepare the engine from files that are already stored and verified. */
  load(assets: OcrAssetSource): Promise<void>;
  recognize(image: GrayImage, signal?: AbortSignal): Promise<OcrResult>;
  /** Free workers and memory. Safe to call repeatedly. */
  dispose(): Promise<void>;
}

/** Where an engine reads its files from (the extension package). */
export interface OcrAssetSource {
  /** Bytes of a stored file by its manifest name, e.g. "dan.traineddata". */
  read(name: string): Promise<ArrayBuffer>;
}

export interface OcrAssetFile {
  /** Name inside the pack, e.g. "dan.traineddata". */
  name: string;
  sha256: string;
  bytes: number;
}

export interface OcrPackManifest {
  /** Engine id the pack belongs to. */
  engineId: string;
  label: string;
  version: string;
  licence: string;
  files: OcrAssetFile[];
}

export function totalPackBytes(pack: OcrPackManifest): number {
  return pack.files.reduce((sum, f) => sum + f.bytes, 0);
}
