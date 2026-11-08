import { uncheckedOfficeParts } from '../files/ooxml-strip';
import { needsSniffing, resolveFileKinds } from '../files/sniff';
import { MAX_OFFICE_BYTES } from '../files/ooxml-text';
import { MAX_BLACKOUT_PAGES, MAX_OCR_PAGES } from '../ocr/pdf';
import { fileKind, type FileKind } from '../files/kinds';
import { officeFilesSkipped, showOfficeNotice, unreadableFilesPresent } from '../ui/office-notice/office-notice';
import { MAX_TEXT_FILE_BYTES } from '../files/text-file';
import type { OcrResultResponse, PiiSpan } from '../shared/message-types';
import { coverageNotes } from '../shared/detection-result';
import { t } from '../shared/i18n/core';
import type { MessageKey } from '../shared/i18n/da';
import type { ImageCheckDecision, ImageCheckDialogInput } from '../ui/image-check-dialog/image-check-dialog';

type ScanPayload = OcrResultResponse['payload'];

/** Images larger than this are not scanned; the user is asked instead. */
export const MAX_SCAN_BYTES = 15 * 1024 * 1024;
/** PDFs may be a little larger than images. */
export const MAX_PDF_SCAN_BYTES = 25 * 1024 * 1024;

export interface TextReviewArgs {
  file: File;
  kind: Exclude<FileKind, 'image'>;
  /** The text that was read; the spans' offsets (UTF-8 bytes) refer to it. */
  text: string;
  spans: PiiSpan[];
  notes: string[];
  /** Findings in the file name (positions in the name without its extension). */
  nameSpans: PiiSpan[];
  /** True when a blacked-out copy can be made (PDF with every page read). */
  canBlackout: boolean;
  /** Which file of the selection this is (1-based). */
  position: { index: number; total: number };
}

export interface ImageReviewArgs {
  file: File;
  /** The text that was read from the picture; the spans' offsets (UTF-8 bytes) refer to it. */
  text: string;
  spans: PiiSpan[];
  /** Where each span sits on the picture (same order); empty when it could not be located. */
  boxes: ScanPayload['boxes'];
  /** Findings in the file name (positions in the name without its extension). */
  nameSpans: PiiSpan[];
  position: { index: number; total: number };
}

export interface AttachmentInterceptorDeps {
  scan(file: File): Promise<ScanPayload>;
  /** Detection on a file name (the name is passed whole, the spans are positions in it without its extension). */
  scanName?(fileName: string): Promise<PiiSpan[]>;
  ask(input: ImageCheckDialogInput): Promise<ImageCheckDecision>;
  /**
   * Review for files whose text was read (PDF, Word, Excel, PowerPoint, text). Resolves to the file to attach:
   * the original, a copy with replacements, a blacked-out PDF, or null to leave it out.
   */
  reviewText(args: TextReviewArgs): Promise<File | null>;
  /**
   * Review for an image with findings: the same review as text, with the picture in place of the text.
   * Resolves to the file to attach (the original or a blacked-out copy), or null to leave it out.
   */
  reviewImage(args: ImageReviewArgs): Promise<File | null>;
  /** Called around each scan so the page can show that work is going on. */
  onBusy?(busy: boolean, fileName: string): void;
}

/** True for every kind of file the extension reads: images, PDFs, Word, Excel, PowerPoint and text files. */
export function isScannableImage(file: File): boolean {
  return fileKind(file) !== null;
}

function maxScanBytes(file: File): number {
  switch (fileKind(file)) {
    case 'pdf':
      return MAX_PDF_SCAN_BYTES;
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return MAX_OFFICE_BYTES;
    case 'text':
      return MAX_TEXT_FILE_BYTES;
    default:
      return MAX_SCAN_BYTES;
  }
}

export function isPdf(file: File): boolean {
  return fileKind(file) === 'pdf';
}

/** What the review says about the parts of a Word, Excel or PowerPoint file that are removed or not read. */
export async function officeNotes(file: File, kind: FileKind): Promise<string[]> {
  if (kind !== 'docx' && kind !== 'xlsx' && kind !== 'pptx') return [];
  const notes = [t('file.officeRemoved')];
  try {
    const parts = uncheckedOfficeParts(new Uint8Array(await file.arrayBuffer()));
    if (parts.length > 0) {
      notes.push(t('file.officeUnchecked', { parts: parts.map((part) => t(`file.part.${part}` as MessageKey)).join(', ') }));
    }
  } catch {
    // The text pass reads the same archive and has already reported a file it cannot open.
  }
  return notes;
}

/** Plain-language notes about what could not be read in a PDF. */
export function pdfNotes(pdf: ScanPayload['pdf']): string[] {
  if (!pdf) return [];
  const notes: string[] = [];
  if (pdf.unreadScans > 0) {
    const why =
      pdf.unreadReason === 'limit'
        ? `only the first ${MAX_OCR_PAGES} scanned pages are read`
        : 'the image-reading files are not installed';
    notes.push(`${pdf.unreadScans} scanned page${pdf.unreadScans === 1 ? ' was' : 's were'} not read: ${why}.`);
  }
  if (pdf.truncated) notes.push(`Only the first ${pdf.pages.length} pages were checked.`);
  return notes;
}

function debug(...args: unknown[]): void {
  console.debug('[PG:attach]', ...args);
}

/** The page's own hidden upload input, if it has one that takes images. */
function findImageInput(): HTMLInputElement | null {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    const accept = input.accept.toLowerCase();
    if (!accept || accept.includes('image') || accept.includes('*/*')) return input;
  }
  return null;
}

/**
 * Holds images picked, dropped or pasted into a chat page, reads their text
 * with the local OCR engine and asks before an image that seems to contain
 * personal data is attached. Everything stays on this machine.
 *
 * Supported images, PDFs, Office and plain-text files are held until review.
 */
export class AttachmentInterceptor {
  private enabled = false;
  /** Excel and PowerPoint files are only read when the user has switched that on (default off). */
  private officeEnabled = false;
  private redelivering = false;
  private pendingNativeChanges = new WeakSet<HTMLInputElement>();
  private inputSelections = new WeakMap<HTMLInputElement, object>();

  constructor(private readonly deps: AttachmentInterceptorDeps) {}

  start(): void {
    window.addEventListener('input', this.onFileInput, true);
    window.addEventListener('change', this.onChange, true);
    window.addEventListener('drop', this.onDrop, true);
    window.addEventListener('paste', this.onPaste, true);
  }

  stop(): void {
    window.removeEventListener('input', this.onFileInput, true);
    window.removeEventListener('change', this.onChange, true);
    window.removeEventListener('drop', this.onDrop, true);
    window.removeEventListener('paste', this.onPaste, true);
  }

  setOfficeEnabled(enabled: boolean): void {
    this.officeEnabled = enabled;
  }

  /** A file this interceptor reads: any known kind, except Excel/PowerPoint while that is switched off (they pass through untouched, like other unsupported types). */
  private canHandle(file: File): boolean {
    if (!isScannableImage(file)) return false;
    const kind = fileKind(file);
    return this.officeEnabled || (kind !== 'xlsx' && kind !== 'pptx');
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Scan the files and return those that may go ahead (possibly redacted copies).
   *
   * The first file is read at once. The rest are queued behind it and read in
   * the background while the user looks at the first result, so by the time
   * they get to the next file its answer is usually ready. The engine reads
   * one file at a time, so queueing costs nothing over running them together.
   */
  async filter(files: File[]): Promise<File[]> {
    const unsure = files.filter(needsSniffing);
    await resolveFileKinds(files);
    // The notice for these had to wait until their bytes had been read.
    this.noticeForSkippedFiles(unsure);
    const scans = new Map<File, { promise: Promise<ScanPayload>; settled: boolean }>();
    let queue: Promise<unknown> = Promise.resolve();
    for (const file of files) {
      if (!this.canHandle(file) || file.size > maxScanBytes(file)) continue;
      const entry = { promise: Promise.resolve(null as unknown as ScanPayload), settled: false };
      entry.promise = queue.then(() => this.scanSafely(file)).then((result) => {
        entry.settled = true;
        return result;
      });
      queue = entry.promise;
      scans.set(file, entry);
    }

    const allowed: File[] = [];
    for (const [i, file] of files.entries()) {
      const kept = await this.checkOne(file, scans.get(file), { index: i + 1, total: files.length });
      if (kept) allowed.push(kept);
    }
    return allowed;
  }

  /** Run one scan; a failure becomes a result so the queue never breaks. */
  private async scanSafely(file: File): Promise<ScanPayload> {
    try {
      return await this.deps.scan(file);
    } catch (error) {
      return {
        requestId: '',
        status: 'failed',
        text: '',
        spans: [],
        boxes: [],
        meanConfidence: 0,
        ms: 0,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Personal data in the file name. A failed check is no reason to stop the file; its content was read. */
  private async scanNameSafely(file: File): Promise<PiiSpan[]> {
    try {
      return (await this.deps.scanName?.(file.name)) ?? [];
    } catch {
      return [];
    }
  }

  private async askAbout(file: File, problem: string): Promise<File | null> {
    const decision = await this.deps.ask({ fileName: file.name, items: [], problem });
    return decision === 'attach' ? file : null;
  }

  private async checkOne(
    file: File,
    scan: { promise: Promise<ScanPayload>; settled: boolean } | undefined,
    position: { index: number; total: number },
  ): Promise<File | null> {
    if (!this.canHandle(file)) return file;
    if (!scan) return this.askAbout(file, t('file.tooLarge'));

    // Only show the busy state when the answer is not ready yet.
    if (!scan.settled) this.deps.onBusy?.(true, file.name);
    let result: ScanPayload;
    try {
      result = await scan.promise;
    } finally {
      this.deps.onBusy?.(false, file.name);
    }
    debug('scan result', result.status, result.spans.length, 'items');

    // The user turned the feature off or removed the files meanwhile.
    if (result.status === 'not-installed') return file;
    // The user pressed Cancel while it was reading: leave the image out.
    if (result.status === 'failed' && result.message === 'canceled') return null;
    if (result.status !== 'ok') {
      const why = result.message ? ` (${result.message})` : '';
      return this.askAbout(file, `the text in it could not be read${why}.`);
    }
    const notes = [...pdfNotes(result.pdf), ...coverageNotes(result.nerCoverage)];
    const nameSpans = await this.scanNameSafely(file);
    if (result.spans.length === 0 && nameSpans.length === 0) {
      // Nothing found, but if part of the file could not be read the user should hear about it.
      if (notes.length === 0) return file;
      const decision = await this.deps.ask({ fileName: file.name, items: [], canRedact: false, notes, problem: 'part of it could not be checked.' });
      return decision === 'attach' ? file : null;
    }

    const kind = fileKind(file);
    if (kind && kind !== 'image') {
      return this.deps.reviewText({
        file,
        kind,
        text: result.text,
        spans: result.spans,
        notes: [...notes, ...(await officeNotes(file, kind))],
        nameSpans,
        canBlackout:
          kind === 'pdf' &&
          !!result.pdf &&
          !result.pdf.truncated &&
          result.pdf.unreadScans === 0 &&
          result.pdf.pageCount <= MAX_BLACKOUT_PAGES,
        position,
      });
    }

    return this.deps.reviewImage({
      file,
      text: result.text,
      spans: result.spans,
      boxes: result.boxes,
      nameSpans,
      position,
    });
  }

  /** True for events the user caused. Events a page script makes up are not trusted and are left alone. */
  protected isUserEvent(event: Event): boolean {
    return event.isTrusted;
  }

  private shouldHandle(event: Event, files: FileList | File[] | null | undefined): File[] | null {
    if (!this.enabled || this.redelivering || !this.isUserEvent(event)) return null;
    const list = files ? Array.from(files) : [];
    // A file with no usable type can be anything; its first bytes are read (asynchronously) in filter(), so it is held too.
    const unsure = list.filter(needsSniffing);
    this.noticeForSkippedFiles(list.filter((file) => !needsSniffing(file)));
    return unsure.length > 0 || list.some((file) => this.canHandle(file)) ? list : null;
  }

  /** Excel/PowerPoint pass through unchecked while that switch is off, and so do types it cannot read: say so, once. */
  private noticeForSkippedFiles(files: File[]): void {
    // Excel/PowerPoint pass through unchecked while that switch is off: say so, once, with a way to turn it on.
    if (officeFilesSkipped(files, this.officeEnabled)) showOfficeNotice({ onEnabled: () => this.setOfficeEnabled(true) });
    // A type the extension cannot read at all goes through unchecked as well; the user should know.
    else if (unreadableFilesPresent(files)) showOfficeNotice({ variant: 'unreadable' });
  }

  private toTransfer(files: File[]): DataTransfer {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    return transfer;
  }

  private redeliver(dispatch: () => void): void {
    this.redelivering = true;
    try {
      dispatch();
    } finally {
      this.redelivering = false;
    }
  }

  private setInputFiles(input: HTMLInputElement, files: File[]): void {
    input.files = this.toTransfer(files).files;
    this.redeliver(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    debug('files handed to the page through its upload input', files.length, 'file(s)');
  }

  private readonly onFileInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    if (!this.redelivering && this.isUserEvent(event)) {
      // Even a new unsupported/disabled selection supersedes a pending review.
      this.inputSelections.delete(input);
      if (event.type === 'input') this.pendingNativeChanges.delete(input);
    }
    const files = this.shouldHandle(event, input.files);
    if (!files) return;
    debug('held files from an upload input', files.length, 'file(s)');
    event.stopImmediatePropagation();
    if (event.type === 'input') this.pendingNativeChanges.add(input);
    const selection = {};
    this.inputSelections.set(input, selection);
    // Native selection fires input before change. Remove the originals now,
    // before either page event handler (or a later read of the control) can
    // obtain them. The File objects above remain valid for local review.
    input.value = '';
    void this.filter(files).then((allowed) => {
      if (this.inputSelections.get(input) !== selection || !input.isConnected || allowed.length === 0) return;
      this.setInputFiles(input, allowed);
    }).catch((error) => {
      console.error('[PG:attach] File review failed; files were not attached.', error);
    }).finally(() => {
      if (this.inputSelections.get(input) === selection) this.inputSelections.delete(input);
    });
  };

  private readonly onChange = (event: Event): void => {
    const input = event.target;
    if (!this.redelivering && input instanceof HTMLInputElement && this.isUserEvent(event) && this.pendingNativeChanges.has(input)) {
      this.pendingNativeChanges.delete(input);
      event.stopImmediatePropagation();
      return;
    }
    this.onFileInput(event);
  };

  /**
   * The page never sees a drop we hold back, so a drop-zone overlay it opened on
   * dragenter ("Add files", "Add anything") would stay up. Telling it the drag has left
   * lets the page close its overlay itself. It has to look like a real drag: pages
   * read `dataTransfer` to decide whether a drag carries files, and ignore a bare event.
   */
  private endPageDrag(target: EventTarget | null, files: File[]): void {
    if (!(target instanceof Element)) return;
    this.redeliver(() => {
      target.dispatchEvent(
        new DragEvent('dragleave', {
          bubbles: true,
          cancelable: true,
          dataTransfer: this.toTransfer(files),
        }),
      );
    });
  }

  private readonly onDrop = (event: Event): void => {
    const drag = event as DragEvent;
    const files = this.shouldHandle(event, drag.dataTransfer?.files);
    if (!files) return;
    debug('held dropped files', files.length, 'file(s)');
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    this.endPageDrag(target, files);
    void this.filter(files).then((allowed) => {
      if (allowed.length === 0) return;
      // The page's own upload input is the most dependable way in, but it is the image input: a file
      // of a type we do not read (held only because its type was generic) goes back as the drop it was.
      const input = allowed.some((file) => fileKind(file) !== null) ? findImageInput() : null;
      if (input) {
        this.setInputFiles(input, allowed);
        return;
      }
      if (!(target instanceof Element)) return;
      this.redeliver(() =>
        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: drag.clientX,
            clientY: drag.clientY,
            dataTransfer: this.toTransfer(allowed),
          }),
        ),
      );
    });
  };

  private readonly onPaste = (event: Event): void => {
    const clip = (event as ClipboardEvent).clipboardData;
    const files = this.shouldHandle(event, clip?.files);
    if (!files || !clip) return;
    debug('held pasted files', files.length, 'file(s)');
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    const text = clip.getData('text/plain');
    void this.filter(files).then((allowed) => {
      const input = allowed.length > 0 ? findImageInput() : null;
      if (input) this.setInputFiles(input, allowed);
      if (!(target instanceof Element)) return;
      // Text that came along with the image still goes through the normal paste path.
      // With no upload input on the page, the files go in the synthetic paste too.
      const withFiles = !input && allowed.length > 0;
      if (!text && !withFiles) return;
      const transfer = withFiles ? this.toTransfer(allowed) : new DataTransfer();
      if (text) transfer.setData('text/plain', text);
      this.redeliver(() =>
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })),
      );
    });
  };
}
