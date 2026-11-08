export type FileKind = 'image' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'text';

/** Files whose text is read here (not by the OCR engine) and that can be rewritten in their own format. */
export type LocalFileKind = 'text' | 'docx' | 'xlsx' | 'pptx';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif']);
/** Pictures dragged in from some apps arrive with no type at all, so the extension counts too. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']);
/** Plain-text formats: read as text, replaced in place, written back in the same format. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'csv', 'tsv', 'md', 'markdown', 'log', 'json', 'xml', 'html', 'htm',
  'yaml', 'yml', 'ini', 'eml', 'vcf', 'ics',
]);
const TEXT_TYPES = new Set([
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/xml', 'text/calendar', 'text/vcard',
  'text/tab-separated-values', 'application/json', 'application/xml', 'message/rfc822',
]);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Kinds decided from a file's first bytes (see sniff.ts); they win over what the name and type say. */
const sniffedKinds = new WeakMap<object, FileKind | null>();

export function rememberFileKind(file: object, kind: FileKind | null): void {
  sniffedKinds.set(file, kind);
}

/** Which kind of file this is, or null when it is not one the extension reads. */
export function fileKind(file: { name: string; type: string }): FileKind | null {
  return sniffedKinds.has(file) ? (sniffedKinds.get(file) ?? null) : declaredKind(file);
}

/** The kind the name and MIME type claim. */
function declaredKind(file: { name: string; type: string }): FileKind | null {
  if (IMAGE_TYPES.has(file.type) || IMAGE_EXTENSIONS.has(extension(file.name))) return 'image';
  if (file.type === 'application/pdf' || extension(file.name) === 'pdf') return 'pdf';
  if (file.type === DOCX_TYPE || extension(file.name) === 'docx') return 'docx';
  if (file.type === XLSX_TYPE || extension(file.name) === 'xlsx') return 'xlsx';
  if (file.type === PPTX_TYPE || extension(file.name) === 'pptx') return 'pptx';
  if (TEXT_EXTENSIONS.has(extension(file.name)) || TEXT_TYPES.has(file.type)) {
    return 'text';
  }
  return null;
}

/** What the first bytes of a file say it is. A zip is only a container; sniff.ts looks inside it. */
export type BinaryKind = 'image' | 'pdf' | 'zip';

const hasText = (head: Uint8Array, text: string, at = 0) =>
  [...text].every((ch, i) => head[at + i] === ch.charCodeAt(0));

/** Decide from at least the first 32 bytes of a file. */
export function sniffBinaryKind(head: Uint8Array): BinaryKind | null {
  if (head[0] === 0x89 && hasText(head, 'PNG', 1) && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) {
    return 'image';
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image';
  if (hasText(head, 'GIF87a') || hasText(head, 'GIF89a')) return 'image';
  if (hasText(head, 'RIFF') && hasText(head, 'WEBP', 8)) return 'image';
  // Two letters alone would match any text starting with "BM", so the reserved words and the header size must fit too.
  const bmpHeaderSizes = [12, 40, 52, 56, 64, 108, 124];
  if (hasText(head, 'BM') && head.slice(6, 10).every((b) => b === 0) && bmpHeaderSizes.includes(head[14]) && head[15] === 0) {
    return 'image';
  }
  if (hasText(head, '%PDF-')) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6))) return 'zip';
  return null;
}

/** "report.final.pdf" -> "report.final" */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
