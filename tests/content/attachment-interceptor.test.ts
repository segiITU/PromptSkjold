/** @jest-environment jsdom */
import { AttachmentInterceptor, isScannableImage, pdfNotes } from '../../src/content/attachment-interceptor';
import type { OcrResultResponse, PiiSpan } from '../../src/shared/message-types';
import type { ImageCheckDecision, ImageCheckDialogInput } from '../../src/ui/image-check-dialog/image-check-dialog';
import type { ImageReviewArgs, TextReviewArgs } from '../../src/content/attachment-interceptor';

type Payload = OcrResultResponse['payload'];

const span = (entity_type: PiiSpan['entity_type'], text = 'x'): PiiSpan => ({
  start: 0, end: 1, entity_type, score: 0.9, text, source: 'regex',
});
const box = { x0: 1, y0: 2, x1: 30, y1: 12 };
const payload = (patch: Partial<Payload>): Payload => ({
  requestId: 'r', status: 'ok', text: '', spans: [], boxes: [], meanConfidence: 90, ms: 1, ...patch,
});
const image = (name: string, size = 100) => new File([new Uint8Array(size)], name, { type: 'image/png' });

beforeAll(() => {
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

function setup(result: Payload | Error, decision: ImageCheckDecision = 'drop') {
  const asked: ImageCheckDialogInput[] = [];
  const busy: boolean[] = [];
  const reviewed: TextReviewArgs[] = [];
  const reviewedImages: ImageReviewArgs[] = [];
  const interceptor = new AttachmentInterceptor({
    reviewText: async (args) => {
      reviewed.push(args);
      return decision === 'attach' ? args.file : null;
    },
    scan: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    ask: async (input) => {
      asked.push(input);
      return decision;
    },
    reviewImage: async (args) => {
      reviewedImages.push(args);
      return decision === 'attach' ? args.file : null;
    },
    onBusy: (b) => void busy.push(b),
  });
  return { interceptor, asked, busy, reviewed, reviewedImages };
}

describe('AttachmentInterceptor.filter', () => {
  test('lets an image with no personal data through without asking', async () => {
    const { interceptor, asked } = setup(payload({}));
    const file = image('a.png');
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(asked).toHaveLength(0);
  });

  test('shows the busy state around each scan, even when it fails', async () => {
    const ok = setup(payload({}));
    await ok.interceptor.filter([image('a.png')]);
    expect(ok.busy).toEqual([true, false]);
    const failing = setup(new Error('boom'));
    await failing.interceptor.filter([image('a.png')]);
    expect(failing.busy).toEqual([true, false]);
  });

  test('an image with findings goes to the same review as text, with the picture and where each item sits', async () => {
    const spans = [span('CPR', '140692-1234'), span('PERSON', 'Mikkel')];
    const { interceptor, asked, reviewedImages } = setup(
      payload({ text: 'CPR 140692-1234 Mikkel', spans, boxes: [[box], []] }),
      'drop',
    );
    expect(await interceptor.filter([image('a.png')])).toEqual([]);
    expect(asked).toHaveLength(0);
    expect(reviewedImages[0]).toMatchObject({ text: 'CPR 140692-1234 Mikkel', spans, boxes: [[box], []] });
    expect(reviewedImages[0].position).toEqual({ index: 1, total: 1 });
  });

  test('what the image review returns is what gets attached', async () => {
    const { interceptor } = setup(payload({ spans: [span('EMAIL')], boxes: [[box]] }), 'attach');
    const file = image('a.png');
    expect(await interceptor.filter([file])).toEqual([file]);
  });

  test('JPEG and the other image types take the same route', async () => {
    const jpg = new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });
    const { interceptor, reviewedImages } = setup(payload({ spans: [span('EMAIL')], boxes: [[box]] }), 'drop');
    await interceptor.filter([jpg]);
    expect(reviewedImages).toHaveLength(1);
  });

  test('a failed scan asks instead of passing silently', async () => {
    const { interceptor, asked } = setup(new Error('boom'), 'drop');
    expect(await interceptor.filter([image('a.png')])).toEqual([]);
    expect(asked[0].problem).toBeDefined();
  });

  test('partial NER coverage asks before attaching even when no personal data was found', async () => {
    const { interceptor, asked } = setup(payload({ nerCoverage: { mode: 'partial', totalChunks: 10, scannedChunks: 2, skippedNonProse: 0, budgetExhausted: true } }), 'drop');
    expect(await interceptor.filter([new File(['text'], 'long.txt', { type: 'text/plain' })])).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(asked[0].notes).toHaveLength(1);
    expect(asked[0].problem).toMatch(/part of it/);
  });

  test('a canceled scan leaves the image out without asking', async () => {
    const { interceptor, asked } = setup(payload({ status: 'failed', message: 'canceled' }), 'attach');
    expect(await interceptor.filter([image('a.png')])).toEqual([]);
    expect(asked).toHaveLength(0);
  });

  test('an unreadable image asks instead of passing silently', async () => {
    const { interceptor, asked } = setup(payload({ status: 'unreadable' }), 'drop');
    expect(await interceptor.filter([image('a.png')])).toEqual([]);
    expect(asked).toHaveLength(1);
  });

  test('passes everything when the feature is off or files were removed', async () => {
    const { interceptor, asked } = setup(payload({ status: 'not-installed' }));
    const file = image('a.png');
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(asked).toHaveLength(0);
  });

  test('non-image files are not touched', async () => {
    const { interceptor, asked } = setup(payload({ spans: [span('CPR')] }));
    const sheet = new File(['x'], 'a.xls', { type: 'application/vnd.ms-excel' });
    expect(await interceptor.filter([sheet])).toEqual([sheet]);
    expect(asked).toHaveLength(0);
  });

  test('an oversized image asks rather than being sent unchecked', async () => {
    const { interceptor, asked } = setup(payload({}), 'drop');
    expect(await interceptor.filter([image('big.png', 16 * 1024 * 1024)])).toEqual([]);
    expect(asked[0].problem).toMatch(/too large/);
  });
});

describe('file names', () => {
  const nameSpans = [{ ...span('PERSON', 'Mette Hansen'), start: 10, end: 22 }];

  function build(scanName: (n: string) => Promise<PiiSpan[]>, scanned: Payload = payload({})) {
    const reviewed: TextReviewArgs[] = [];
    const reviewedImages: ImageReviewArgs[] = [];
    const interceptor = new AttachmentInterceptor({
      scan: async () => scanned,
      scanName,
      ask: async () => 'drop',
      reviewText: async (args) => { reviewed.push(args); return args.file; },
      reviewImage: async (args) => { reviewedImages.push(args); return args.file; },
    });
    return { interceptor, reviewed, reviewedImages };
  }

  test('a name with a person in it goes to review even when the text has nothing', async () => {
    const asked: string[] = [];
    const { interceptor, reviewed } = build(async (n) => { asked.push(n); return nameSpans; });
    const file = new File(['Hej'], 'Lønseddel_Mette_Hansen.txt', { type: 'text/plain' });
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(asked).toEqual(['Lønseddel_Mette_Hansen.txt']);
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].spans).toEqual([]);
    expect(reviewed[0].nameSpans).toEqual(nameSpans);
  });

  test('the same for a picture', async () => {
    const { interceptor, reviewedImages } = build(async () => nameSpans);
    await interceptor.filter([image('Mette_Hansen.png')]);
    expect(reviewedImages).toHaveLength(1);
    expect(reviewedImages[0].nameSpans).toEqual(nameSpans);
  });

  test('a name with nothing in it changes nothing', async () => {
    const { interceptor, reviewed, reviewedImages } = build(async () => []);
    const file = image('foto.png');
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(reviewed).toHaveLength(0);
    expect(reviewedImages).toHaveLength(0);
  });

  test('findings in the text and in the name are reviewed together', async () => {
    const { interceptor, reviewed } = build(async () => nameSpans, payload({ text: 'Mikkel', spans: [span('PERSON', 'Mikkel')], boxes: [[]] }));
    await interceptor.filter([new File(['x'], 'Mette_Hansen.txt', { type: 'text/plain' })]);
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].spans).toHaveLength(1);
    expect(reviewed[0].nameSpans).toEqual(nameSpans);
  });

  test('a name check that fails does not stop the file', async () => {
    const { interceptor, reviewed } = build(async () => { throw new Error('boom'); });
    const file = image('foto.png');
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(reviewed).toHaveLength(0);
  });
});

describe('several files', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('later files are scanned in the background while the first dialog is open', async () => {
    const scanned: string[] = [];
    const busy: boolean[] = [];
    const open: Array<(attach: boolean) => void> = [];
    const interceptor = new AttachmentInterceptor({
      scan: async (file) => {
        scanned.push(file.name);
        return payload({ spans: [span('CPR')], boxes: [[box]] });
      },
      ask: async () => 'drop',
      reviewImage: (args) => new Promise((resolve) => void open.push((attach) => resolve(attach ? args.file : null))),
      reviewText: async () => null,
      onBusy: (b) => void busy.push(b),
    });

    const done = interceptor.filter([image('a.png'), image('b.png'), image('c.png')]);
    await tick();
    await tick();
    // The first dialog is open and every file has already been scanned.
    expect(open).toHaveLength(1);
    expect(scanned).toEqual(['a.png', 'b.png', 'c.png']);

    open[0](false);
    await tick();
    await tick();
    // The second answer was ready: the busy indicator was shown for the first file only.
    expect(busy.filter(Boolean)).toHaveLength(1);
    open[1](true);
    await tick();
    await tick();
    open[2](false);
    expect((await done).map((f) => f.name)).toEqual(['b.png']);
  });

  test('each text review is told which file of how many it is', async () => {
    const a = new File(['x'], 'a.txt', { type: 'text/plain' });
    const b = new File(['x'], 'b.txt', { type: 'text/plain' });
    const { interceptor, reviewed } = setup(payload({ text: 'Mikkel', spans: [span('PERSON', 'Mikkel')], boxes: [[]] }), 'attach');
    await interceptor.filter([a, b]);
    expect(reviewed.map((r) => [r.file.name, r.position])).toEqual([
      ['a.txt', { index: 1, total: 2 }],
      ['b.txt', { index: 2, total: 2 }],
    ]);
  });

  test('files are scanned one at a time, in order', async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const interceptor = new AttachmentInterceptor({
      scan: async (file) => {
        running += 1;
        peak = Math.max(peak, running);
        order.push(file.name);
        await tick();
        running -= 1;
        return payload({});
      },
      ask: async () => 'drop',
      reviewImage: async () => null,
      reviewText: async () => null,
    });
    await interceptor.filter([image('a.png'), image('b.png'), image('c.png')]);
    expect(peak).toBe(1);
    expect(order).toEqual(['a.png', 'b.png', 'c.png']);
  });

  test('one failing scan does not stop the others', async () => {
    let n = 0;
    const interceptor = new AttachmentInterceptor({
      scan: async () => {
        n += 1;
        if (n === 1) throw new Error('boom');
        return payload({});
      },
      ask: async () => 'drop',
      reviewImage: async () => null,
      reviewText: async () => null,
    });
    const second = image('b.png');
    expect(await interceptor.filter([image('a.png'), second])).toEqual([second]);
  });
});

describe('a held drop', () => {
  /** Stands in for the user: jsdom cannot make a trusted event, a real drop always is one. */
  class UserInterceptor extends AttachmentInterceptor {
    protected isUserEvent(): boolean {
      return true;
    }
  }

  function drop(files: File[]): Event {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    return event;
  }

  function make(overrides: { scan?: (file: File) => Promise<Payload> } = {}) {
    const interceptor = new UserInterceptor({
      // A canceled scan leaves the file out, so nothing is handed back to the page afterwards.
      scan: overrides.scan ?? (async () => payload({ status: 'failed', message: 'canceled' })),
      ask: async () => 'drop',
      reviewImage: async () => null,
      reviewText: async () => null,
    });
    interceptor.setEnabled(true);
    interceptor.start();
    const zone = document.createElement('div');
    document.body.append(zone);
    return {
      zone,
      done: () => {
        interceptor.stop();
        zone.remove();
      },
    };
  }

  beforeAll(() => {
    // jsdom has no DataTransfer; the hand-back after the check needs one.
    // ...and no DragEvent either.
    (globalThis as unknown as { DragEvent: unknown }).DragEvent = class extends Event {
      dataTransfer: unknown;
      constructor(type: string, init: { dataTransfer?: unknown } & EventInit = {}) {
        super(type, init);
        this.dataTransfer = init.dataTransfer ?? null;
      }
    };
    (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = class {
      items = { add: () => undefined };
      files: File[] = [];
    };
  });

  test('tells the page the drag is over, so a drop-zone overlay it opened closes', () => {
    const { zone, done } = make();
    const events: string[] = [];
    let carriedTransfer = false;
    zone.addEventListener('dragleave', (e) => {
      events.push(e.type);
      // Some pages ignore a bare event and look for the dragged files.
      carriedTransfer = e instanceof DragEvent && Boolean((e as DragEvent).dataTransfer);
    });
    try {
      zone.dispatchEvent(drop([image('a.png')]));
      // Straight away, not after the scan: the page must not wait with its overlay open.
      expect(events).toEqual(['dragleave']);
      expect(carriedTransfer).toBe(true);
    } finally {
      done();
    }
  });

  test('the page itself never sees the drop', () => {
    const { zone, done } = make();
    const events: string[] = [];
    zone.addEventListener('drop', () => events.push('drop'));
    try {
      zone.dispatchEvent(drop([image('a.png')]));
      expect(events).toEqual([]);
    } finally {
      done();
    }
  });

  test('a picture with no type and no extension is held and scanned as an image', async () => {
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const scanned: string[] = [];
    const { zone, done } = make({ scan: async (f) => { scanned.push(f.name); return payload({}); } });
    const events: string[] = [];
    zone.addEventListener('drop', () => events.push('drop'));
    try {
      zone.dispatchEvent(drop([new File([png], 'blob', { type: '' })]));
      expect(events).toEqual([]); // held, the page does not see it
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(scanned).toEqual(['blob']);
    } finally {
      done();
    }
  });

  test('a drop with nothing we read in it is left alone and no drag end is faked', () => {
    const { zone, done } = make();
    const events: string[] = [];
    zone.addEventListener('dragleave', () => events.push('dragleave'));
    zone.addEventListener('drop', () => events.push('drop'));
    try {
      zone.dispatchEvent(drop([new File(['x'], 'a.xls', { type: 'application/vnd.ms-excel' })]));
      expect(events).toEqual(['drop']);
    } finally {
      done();
    }
  });
});

describe('helpers', () => {
  test('isScannableImage', () => {
    expect(isScannableImage(image('a.png'))).toBe(true);
    expect(isScannableImage(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toBe(false);
  });

});

describe('native upload event ordering', () => {
  class UserInterceptor extends AttachmentInterceptor {
    protected isUserEvent(): boolean { return true; }
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  function make() {
    let files: File[] = [];
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { get: () => files, set: (next: File[]) => { files = next; } });
    Object.defineProperty(input, 'value', { get: () => '', set: () => { files = []; } });
    document.body.append(input);
    const finishes: Array<(result: Payload) => void> = [];
    const scan = jest.fn(() => new Promise<Payload>((resolve) => finishes.push(resolve)));
    const interceptor = new UserInterceptor({ scan, ask: async () => 'drop', reviewText: async () => null, reviewImage: async () => null });
    interceptor.setEnabled(true);
    interceptor.start();
    const originalTransfer = globalThis.DataTransfer;
    (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = class {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    };
    const events: Array<{ event: string; names: string[] }> = [];
    for (const event of ['input', 'change']) input.addEventListener(event, () => events.push({ event, names: Array.from(input.files ?? []).map((f) => f.name) }));
    const select = (selected: File[]) => {
      files = selected;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return { input, interceptor, finishes, scan, select, events, done: () => { interceptor.stop(); input.remove(); globalThis.DataTransfer = originalTransfer; } };
  }

  test('neither input nor its paired change exposes originals; only the approved list is redelivered once', async () => {
    const fixture = make();
    try {
      const file = image('original.png');
      fixture.select([file]);
      expect(fixture.events).toEqual([]);
      expect(Array.from(fixture.input.files ?? [])).toEqual([]);
      await tick();
      expect(fixture.scan).toHaveBeenCalledTimes(1);
      fixture.finishes[0](payload({}));
      await tick();
      expect(fixture.events).toEqual([{ event: 'input', names: ['original.png'] }, { event: 'change', names: ['original.png'] }]);
    } finally { fixture.done(); }
  });

  test('a later selection cannot be overwritten when an earlier review finishes late', async () => {
    const fixture = make();
    try {
      fixture.select([image('first.png')]);
      await tick();
      fixture.select([image('second.png')]);
      await tick();
      fixture.finishes[0](payload({}));
      await tick();
      expect(fixture.events).toEqual([]);
      fixture.finishes[1](payload({}));
      await tick();
      expect(fixture.events.every((e) => e.names.join() === 'second.png')).toBe(true);
      expect(fixture.events).toHaveLength(2);
    } finally { fixture.done(); }
  });

  test('a later unsupported selection also supersedes a pending review', async () => {
    const fixture = make();
    try {
      fixture.select([image('first.png')]);
      await tick();
      // No type, so its first bytes are read before it is handed back unchanged.
      fixture.select([new File(['x'], 'new.xls')]);
      fixture.finishes[0](payload({}));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(fixture.events).toEqual([{ event: 'input', names: ['new.xls'] }, { event: 'change', names: ['new.xls'] }]);
    } finally { fixture.done(); }
  });
});

describe('PDF handling', () => {
  const pdf = () => new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });

  test('a PDF with findings goes to the text review, not the image dialog', async () => {
    const pages = [{ page: 1, kind: 'text' as const }];
    const { interceptor, asked, reviewed } = setup(
      payload({ text: 'CPR 140692-1234', spans: [span('CPR', '140692-1234')], boxes: [[]], pdf: { pages, truncated: false, unreadScans: 0, unreadReason: null, pageCount: 1 } }),
      'drop',
    );
    expect(await interceptor.filter([pdf()])).toEqual([]);
    expect(asked).toHaveLength(0);
    expect(reviewed[0]).toMatchObject({ kind: 'pdf', text: 'CPR 140692-1234', canBlackout: true });
  });

  test('a blacked-out PDF is only offered when every page was read', async () => {
    const partial = { pages: [{ page: 1, kind: 'not-read' as const }], truncated: false, unreadScans: 1, unreadReason: 'no-ocr' as const, pageCount: 1 };
    const a = setup(payload({ spans: [span('CPR')], boxes: [[]], pdf: partial }));
    await a.interceptor.filter([pdf()]);
    expect(a.reviewed[0].canBlackout).toBe(false);
    expect(a.reviewed[0].notes[0]).toMatch(/not read/);

    const cut = { pages: new Array(20).fill({ page: 1, kind: 'text' }), truncated: true, unreadScans: 0, unreadReason: null, pageCount: 1 };
    const b = setup(payload({ spans: [span('CPR')], boxes: [[]], pdf: cut }));
    await b.interceptor.filter([pdf()]);
    expect(b.reviewed[0].canBlackout).toBe(false);
  });

  test('Word and text files go to the text review too, and never offer a blacked-out copy', async () => {
    const docx = new File(['x'], 'a.docx', { type: '' });
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const { interceptor, reviewed } = setup(payload({ text: 'Mikkel', spans: [span('PERSON', 'Mikkel')], boxes: [[]] }), 'attach');
    expect(await interceptor.filter([docx, txt])).toEqual([docx, txt]);
    expect(reviewed.map((r) => [r.kind, r.canBlackout])).toEqual([['docx', false], ['text', false]]);
  });

  test('a text file with nothing found goes through without review', async () => {
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const { interceptor, reviewed } = setup(payload({ spans: [] }));
    expect(await interceptor.filter([txt])).toEqual([txt]);
    expect(reviewed).toHaveLength(0);
  });

  test('a PDF with nothing found goes through', async () => {
    const { interceptor, asked } = setup(
      payload({ pdf: { pages: [{ page: 1, kind: 'text' }], truncated: false, unreadScans: 0, unreadReason: null, pageCount: 1 } }),
    );
    const file = pdf();
    expect(await interceptor.filter([file])).toEqual([file]);
    expect(asked).toHaveLength(0);
  });

  test('a PDF with unread scanned pages is not passed silently, even when nothing was found', async () => {
    const { interceptor, asked } = setup(
      payload({ pdf: { pages: [{ page: 1, kind: 'not-read' }], truncated: false, unreadScans: 1, unreadReason: 'no-ocr' as const, pageCount: 1 } }),
      'drop',
    );
    expect(await interceptor.filter([pdf()])).toEqual([]);
    expect(asked[0].notes?.[0]).toMatch(/1 scanned page was not read/);
  });

  test('a long PDF is not offered as a blacked-out copy', async () => {
    const pages = new Array(30).fill({ page: 1, kind: 'text' });
    const { interceptor, reviewed } = setup(
      payload({ spans: [span('CPR')], boxes: [[]], pdf: { pages, truncated: false, unreadScans: 0, unreadReason: null, pageCount: 30 } }),
    );
    await interceptor.filter([pdf()]);
    expect(reviewed[0].canBlackout).toBe(false);
  });

  test('pdfNotes says why scanned pages were not read', () => {
    expect(pdfNotes({ pages: [], truncated: false, unreadScans: 3, unreadReason: 'limit', pageCount: 30 })[0]).toMatch(/only the first 20 scanned pages/);
    expect(pdfNotes({ pages: [], truncated: false, unreadScans: 1, unreadReason: 'no-ocr', pageCount: 1 })[0]).toMatch(/not installed/);
  });

  test('pdfNotes explains truncation', () => {
    expect(
      pdfNotes({ pages: new Array(20).fill({ page: 1, kind: 'text' }), truncated: true, unreadScans: 0, unreadReason: null, pageCount: 30 }),
    ).toEqual(['Only the first 20 pages were checked.']);
  });
});
