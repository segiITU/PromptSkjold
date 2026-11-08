import { unzipSync } from 'fflate';
import { fileKind, rememberFileKind, sniffBinaryKind, type FileKind } from './kinds';
import { MAX_OFFICE_BYTES } from './ooxml-text';

const HEAD_BYTES = 32;

function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Which Office format a zip is, from the names inside it (nothing is inflated). */
async function officeKindOfZip(file: File): Promise<FileKind | null> {
  if (file.size > MAX_OFFICE_BYTES) return null;
  const names = new Set<string>();
  unzipSync(await readBytes(file), { filter: (entry) => { names.add(entry.name); return false; } });
  if (names.has('word/document.xml')) return 'docx';
  if (names.has('xl/workbook.xml')) return 'xlsx';
  if (names.has('ppt/presentation.xml')) return 'pptx';
  return null;
}

/**
 * Types a browser gives a file whose extension it does not know, or that an app
 * dropped without any type. Such a file can be anything, so its bytes are read.
 */
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'application/zip', 'application/x-zip-compressed']);

/** True for a file whose name and type say too little to trust. */
export function needsSniffing(file: { name: string; type: string }): boolean {
  return fileKind(file) === null && GENERIC_TYPES.has(file.type);
}

/**
 * Decide what each file is from its first bytes, so a picture with an empty or
 * wrong type, or a PDF or Office file with another name, is not waved through
 * as an unknown type. The result is remembered for {@link fileKind}. A file
 * whose bytes match no binary format keeps the kind its name and type give.
 */
export async function resolveFileKinds(files: readonly File[]): Promise<void> {
  for (const file of files) {
    const declared = fileKind(file);
    // Already going to the image or PDF reader, which reports a file that is not what it claims.
    if (declared === 'image' || declared === 'pdf') continue;
    let kind: FileKind | null = declared;
    try {
      const sniffed = sniffBinaryKind(await readBytes(file.slice(0, HEAD_BYTES)));
      if (sniffed === 'image' || sniffed === 'pdf') kind = sniffed;
      else if (sniffed === 'zip') {
        // A package that says it is Word, Excel or PowerPoint stays so; anything else is looked at from inside.
        const office = declared === 'docx' || declared === 'xlsx' || declared === 'pptx';
        kind = office ? declared : await officeKindOfZip(file);
      }
    } catch {
      // Unreadable or damaged: keep what the name says, the reader reports the problem.
    }
    rememberFileKind(file, kind);
  }
}
