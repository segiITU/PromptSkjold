/** @jest-environment jsdom */
import { AttachmentInterceptor } from '../../src/content/attachment-interceptor';
import { officeFilesSkipped, showOfficeNotice, unreadableFilesPresent } from '../../src/ui/office-notice/office-notice';
import { __resetLanguageForTests } from '../../src/shared/i18n/core';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { loadSettings } from '../../src/shared/storage';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const file = (name: string, type: string) => new File(['x'], name, { type });

// The notice uses a closed shadow root; let the tests look inside.
const realAttach = Element.prototype.attachShadow;
beforeAll(() => {
  Element.prototype.attachShadow = function (init: ShadowRootInit) {
    return realAttach.call(this, { ...init, mode: 'open' });
  };
});
afterAll(() => {
  Element.prototype.attachShadow = realAttach;
});
beforeEach(() => {
  document.body.innerHTML = '';
  __resetLanguageForTests('en');
});

function interceptor() {
  const scanned: string[] = [];
  const i = new AttachmentInterceptor({
    scan: async (f) => {
      scanned.push(f.name);
      return { requestId: 'r', status: 'ok', text: '', spans: [], boxes: [], meanConfidence: 90, ms: 1 };
    },
    ask: async () => 'drop',
    reviewText: async () => null,
    reviewImage: async () => null,
  });
  i.setEnabled(true);
  return { i, scanned };
}

describe('the Excel/PowerPoint switch', () => {
  test('defaults to off, and "remember across conversations" defaults to off, for users with nothing stored', async () => {
    expect(DEFAULT_SETTINGS.officeCheckEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.identityVaultEnabled).toBe(false);
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    const s = await loadSettings();
    expect(s.officeCheckEnabled).toBe(false);
    expect(s.identityVaultEnabled).toBe(false);
  });

  test('a stored value is kept, and an old stored settings object without the new key gets false', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ pg_settings: { officeCheckEnabled: true, identityVaultEnabled: true } });
    const kept = await loadSettings();
    expect(kept.officeCheckEnabled).toBe(true);
    expect(kept.identityVaultEnabled).toBe(true);
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ pg_settings: { imageCheckEnabled: true } });
    expect((await loadSettings()).officeCheckEnabled).toBe(false);
  });

  test('off: Excel and PowerPoint files are not scanned and pass through; other kinds still are', async () => {
    const { i, scanned } = interceptor();
    const sheet = file('a.xlsx', XLSX);
    const deck = file('b.pptx', PPTX);
    const doc = file('c.docx', DOCX);
    const result = await i.filter([sheet, deck, doc]);
    expect(scanned).toEqual(['c.docx']);
    expect(result).toEqual(expect.arrayContaining([sheet, deck]));
  });

  test('on: they are scanned like before', async () => {
    const { i, scanned } = interceptor();
    i.setOfficeEnabled(true);
    await i.filter([file('a.xlsx', XLSX), file('b.pptx', PPTX)]);
    expect(scanned).toEqual(['a.xlsx', 'b.pptx']);
  });
});

describe('the "not checked" notice', () => {
  test('trigger: only for xlsx/pptx while the switch is off', () => {
    expect(officeFilesSkipped([file('a.xlsx', XLSX)], false)).toBe(true);
    expect(officeFilesSkipped([file('x.PPTX', '')], false)).toBe(true);
    expect(officeFilesSkipped([file('a.xlsx', XLSX)], true)).toBe(false);
    expect(officeFilesSkipped([file('a.docx', DOCX), file('b.png', 'image/png')], false)).toBe(false);
    expect(officeFilesSkipped([], false)).toBe(false);
  });

  test('shows a polite status with a "Turn on" button; turning on writes the setting, follows at once and confirms', async () => {
    const enable = jest.fn().mockResolvedValue(undefined);
    const onEnabled = jest.fn();
    const n = showOfficeNotice({ enable, onEnabled });
    const root = document.getElementById('pg-office-notice-host')!.shadowRoot!;
    const box = root.querySelector('[role="status"]')!;
    expect(box.getAttribute('aria-live')).toBe('polite');
    expect(box.textContent).toContain('Excel and PowerPoint files are not checked.');
    (root.querySelector('[data-action="enable"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(enable).toHaveBeenCalledTimes(1);
    expect(onEnabled).toHaveBeenCalledTimes(1);
    expect(box.textContent).toContain('Turned on. Applies the next time you attach a file.');
    expect((root.querySelector('[data-action="enable"]') as HTMLButtonElement).hidden).toBe(true);
    n.dispose();
    expect(document.getElementById('pg-office-notice-host')).toBeNull();
  });

  test('a failed write leaves the notice as it was and does not claim success', async () => {
    const enable = jest.fn().mockRejectedValue(new Error('no storage'));
    const onEnabled = jest.fn();
    showOfficeNotice({ enable, onEnabled });
    const root = document.getElementById('pg-office-notice-host')!.shadowRoot!;
    (root.querySelector('[data-action="enable"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onEnabled).not.toHaveBeenCalled();
    expect(root.querySelector('[role="status"]')!.textContent).toContain('not checked');
  });

  test('is dismissible, shows once at a time, and speaks Danish when the language is Danish', () => {
    __resetLanguageForTests('da');
    showOfficeNotice({});
    showOfficeNotice({});
    expect(document.querySelectorAll('#pg-office-notice-host')).toHaveLength(1);
    const root = document.getElementById('pg-office-notice-host')!.shadowRoot!;
    expect(root.textContent).toContain('Excel- og PowerPoint-filer tjekkes ikke.');
    expect(root.textContent).toContain('Slå til');
    (root.querySelector('[data-action="close"]') as HTMLButtonElement).click();
    expect(document.getElementById('pg-office-notice-host')).toBeNull();
  });

  test('the interceptor shows the notice when an xlsx is attached with the switch off, and not when it is on', () => {
    // jsdom events are never trusted; the interceptor only reacts to trusted ones, so treat them as user events here
    class Trusting extends AttachmentInterceptor {
      protected isUserEvent(): boolean {
        return true;
      }
    }
    const i = new Trusting({
      scan: async () => ({ requestId: 'r', status: 'ok', text: '', spans: [], boxes: [], meanConfidence: 90, ms: 1 }),
      ask: async () => 'drop',
      reviewText: async () => null,
      reviewImage: async () => null,
    });
    i.setEnabled(true);
    i.start();
    try {
      const input = document.createElement('input');
      input.type = 'file';
      document.body.appendChild(input);
      const fire = () => {
        Object.defineProperty(input, 'files', { value: [file('a.xlsx', XLSX)], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      fire();
      expect(document.getElementById('pg-office-notice-host')).not.toBeNull();
      document.getElementById('pg-office-notice-host')?.remove();
      i.setOfficeEnabled(true);
      fire();
      expect(document.getElementById('pg-office-notice-host')).toBeNull();
    } finally {
      i.stop();
    }
  });
});

describe('the "cannot be checked" notice for unreadable file types', () => {
  test('trigger: any file the extension cannot read, however it is named', () => {
    expect(unreadableFilesPresent([file('old.doc', 'application/msword')])).toBe(true);
    expect(unreadableFilesPresent([file('scans.zip', 'application/zip')])).toBe(true);
    expect(unreadableFilesPresent([file('blob', '')])).toBe(true);
    // A picture with no type is recognised by its extension, or by its first bytes once they are read.
    expect(unreadableFilesPresent([file('photo.png', '')])).toBe(false);
    expect(unreadableFilesPresent([file('a.docx', DOCX), file('b.png', 'image/png'), file('c.txt', 'text/plain')])).toBe(false);
    expect(unreadableFilesPresent([])).toBe(false);
  });

  test('shows the message without a "Turn on" button, and in Danish when the language is Danish', () => {
    showOfficeNotice({ variant: 'unreadable' });
    const root = document.getElementById('pg-office-notice-host')!.shadowRoot!;
    expect(root.querySelector('[role="status"]')!.textContent).toContain('This file type cannot be checked.');
    expect((root.querySelector('[data-action="enable"]') as HTMLButtonElement).hidden).toBe(true);
    document.getElementById('pg-office-notice-host')?.remove();
    __resetLanguageForTests('da');
    showOfficeNotice({ variant: 'unreadable' });
    expect(document.getElementById('pg-office-notice-host')!.shadowRoot!.textContent).toContain('Denne filtype kan ikke tjekkes.');
  });

  test('the interceptor shows it when a .doc is attached, and not for a file it can read', () => {
    class Trusting extends AttachmentInterceptor {
      protected isUserEvent(): boolean {
        return true;
      }
    }
    const i = new Trusting({
      scan: async () => ({ requestId: 'r', status: 'ok', text: '', spans: [], boxes: [], meanConfidence: 90, ms: 1 }),
      ask: async () => 'drop',
      reviewText: async () => null,
      reviewImage: async () => null,
    });
    i.setEnabled(true);
    i.start();
    try {
      const input = document.createElement('input');
      input.type = 'file';
      document.body.appendChild(input);
      const fire = (f: File) => {
        Object.defineProperty(input, 'files', { value: [f], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      fire(file('a.docx', DOCX));
      expect(document.getElementById('pg-office-notice-host')).toBeNull();
      fire(file('old.doc', 'application/msword'));
      expect(document.getElementById('pg-office-notice-host')).not.toBeNull();
    } finally {
      i.stop();
    }
  });
});
