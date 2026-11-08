import { buildDocx, docxFileName, extractDocxText } from '../files/docx';
import type { FileKind, LocalFileKind } from '../files/kinds';
import { buildPptx, extractPptxText, pptxFileName } from '../files/pptx';
import { buildXlsx, extractXlsxText, xlsxFileName } from '../files/xlsx';
import { baseName } from '../files/kinds';
import { buildPlainTextCopy, buildTextFile } from '../files/text-file';
import type { Replacement } from '../shared/anonymizer';
import type { RedactPdfResponse } from '../shared/message-types';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Decode a base64 data URL into a file (no network involved). */
export function fileFromDataUrl(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',');
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes as BlobPart], name, { type: mime });
}

/** The text of an Office or plain-text file, which is what detection runs on. */
export async function readLocalText(file: File, kind: LocalFileKind): Promise<string> {
  if (kind === 'text') return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === 'docx') return extractDocxText(bytes);
  if (kind === 'xlsx') return extractXlsxText(bytes);
  return extractPptxText(bytes);
}

/**
 * The file to attach after the user chose to replace the found items. `name` is what the copy's name is built
 * from; it differs from the original when personal data in the file name was replaced too.
 */
export async function buildReplacedFile(
  file: File,
  kind: Exclude<FileKind, 'image'>,
  text: string,
  replacements: Replacement[],
  name = file.name,
): Promise<File> {
  if (kind === 'text') return buildTextFile(file, text, replacements, name);
  if (kind === 'pdf') return buildPlainTextCopy(name, text, replacements);
  const source = new Uint8Array(await file.arrayBuffer());
  if (kind === 'xlsx') {
    return new File([buildXlsx(source, replacements) as BlobPart], xlsxFileName(name), { type: XLSX_TYPE });
  }
  if (kind === 'pptx') {
    return new File([buildPptx(source, replacements) as BlobPart], pptxFileName(name), { type: PPTX_TYPE });
  }
  return new File([buildDocx(source, replacements) as BlobPart], docxFileName(name), { type: DOCX_TYPE });
}

export interface PdfRedactionOutcome {
  file: File | null;
  /** Items that were not found on any page and stay visible. */
  missed: string[];
  message?: string;
}

/** Ask the extension for a copy of the PDF with the given items painted over. */
export async function requestPdfRedaction(
  file: File,
  items: string[],
  requestId: string,
  name = file.name,
): Promise<PdfRedactionOutcome> {
  const response = (await chrome.runtime.sendMessage({
    type: 'REDACT_PDF',
    payload: { requestId, dataUrl: await fileToDataUrl(file), items },
  })) as RedactPdfResponse | undefined;
  if (response?.type !== 'REDACT_PDF_RESULT' || response.payload.status !== 'ok' || !response.payload.dataUrl) {
    return { file: null, missed: items, message: response?.payload?.message ?? 'No answer from the extension.' };
  }
  return {
    file: fileFromDataUrl(response.payload.dataUrl, `${baseName(name)}-redacted.pdf`),
    missed: response.payload.missed,
  };
}
