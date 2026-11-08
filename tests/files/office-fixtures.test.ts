/** @jest-environment jsdom */
import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { buildPptx, extractPptxText } from '../../src/files/pptx';
import { buildXlsx, extractXlsxText } from '../../src/files/xlsx';
import type { Replacement } from '../../src/shared/anonymizer';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const DIR = path.join(__dirname, '..', 'fixtures', 'office');
const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(DIR, name)));
const sha = (name: string) => createHash('sha256').update(fs.readFileSync(path.join(DIR, name))).digest('hex');
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function replaceAll(text: string, needle: string, to: string): Replacement[] {
  const out: Replacement[] = [];
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
    out.push({ start: i, end: i + needle.length, text: to } as Replacement);
  }
  return out;
}

const DK_IBAN = 'DK50 0040 0440 1162 43';

describe('synthetic example files (tests/fixtures/office)', () => {
  const xlsx = read('syntetisk-testdata.xlsx');
  const pptx = read('syntetisk-testdata.pptx');

  test('both say "Syntetisk testdata" and contain only made-up addresses', () => {
    for (const text of [extractXlsxText(xlsx), extractPptxText(pptx)]) {
      expect(text).toContain('Syntetisk testdata');
      const emails = text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
      expect(emails.length).toBeGreaterThan(0);
      for (const e of emails) expect(e).toMatch(/@(syntetisk-firma\.test|ermias\.ai)$/);
    }
  });

  describe('xlsx', () => {
    const text = extractXlsxText(xlsx);

    test('reads shared strings, inline strings, numbers, and the merged title', () => {
      for (const s of ['Anna Testesen', 'anna.testesen@syntetisk-firma.test', '+45 28 71 40 93', '111111-1111', '150385-4321', 'Testvej 12, 2200 København N', 'Ring efter kl. 16', DK_IBAN, 'Reg. 5678 konto 9876543210', '192.168.10.24', '15-03-1985']) {
        expect(text).toContain(s);
      }
      expect(text).toContain('125000'); // plain numbers are read
      expect(text).toContain('12345678'); // an order number (not personal data) is just text here
    });

    test('reads the hidden sheet too (it is a worksheet part like any other)', () => {
      expect(text).toContain('Skjult ark');
      expect(text).toContain('070790-1234');
      expect(text).toContain('+45 40 12 34 56');
    });

    test('reads the cached result of a formula cell', () => {
      expect(text).toContain('anna.testesen@syntetisk-firma.test / bjarne.madsen@syntetisk-firma.test');
    });

    test('does NOT read sheet names (they are not text parts)', () => {
      expect(text).not.toContain('Kontakter'); // the name of the first sheet
    });

    test('building with replacements anonymises every occurrence, formula cell included, and leaves the original untouched', () => {
      const before = sha('syntetisk-testdata.xlsx');
      const reps = [
        ...replaceAll(text, 'anna.testesen@syntetisk-firma.test', '[EMAIL_1]'),
        ...replaceAll(text, '111111-1111', '[CPR_1]'),
        ...replaceAll(text, '070790-1234', '[CPR_2]'),
      ].sort((a, b) => a.start - b.start);
      const out = buildXlsx(xlsx, reps);
      const again = extractXlsxText(out);
      expect(again).not.toContain('111111-1111');
      expect(again).not.toContain('070790-1234'); // the hidden sheet is anonymised as well
      expect(again).not.toContain('anna.testesen@syntetisk-firma.test'); // including the formula cell's cached text
      expect(again).toContain('[EMAIL_1]');
      expect(again).toContain('150385-4321'); // untouched ones remain
      expect(sha('syntetisk-testdata.xlsx')).toBe(before);
      // the formula itself is gone from the cell that was rewritten (it becomes plain text)
      const sheet1 = decode(unzipSync(out)['xl/worksheets/sheet1.xml']);
      expect(sheet1).not.toContain('<f>');
    });
  });

  describe('pptx', () => {
    const text = extractPptxText(pptx);

    test('reads text boxes, table cells and all slides', () => {
      for (const s of ['Anna Testesen', 'anna.testesen@syntetisk-firma.test', 'Bjarne Madsen', '+45 31 22 45 67', '150385-4321', 'Camilla Bjerregaard', 'kontakt@ermias.ai', 'tlf. 61 23 45 67', DK_IBAN, 'Reg. 5678 konto 9876543210', '192.168.10.24', 'Testvej 12, 2200 København N', '12-04-1985', 'Ordrenummer 12345678']) {
        expect(text).toContain(s);
      }
    });

    test('speaker notes ARE read (and replaced), notes of slides without findings too', () => {
      expect(text).toContain('CPR til tjek: 111111-1111');
      expect(text).toContain('ring til Anna Testesen på +45 28 71 40 93');
      expect(text).toContain('intet følsomt her');
    });

    test('building with replacements anonymises text-box and table cells and leaves the original untouched', () => {
      const before = sha('syntetisk-testdata.pptx');
      const reps = [...replaceAll(text, '150385-4321', '[CPR_1]'), ...replaceAll(text, 'anna.testesen@syntetisk-firma.test', '[EMAIL_1]')].sort((a, b) => a.start - b.start);
      const out = buildPptx(pptx, reps);
      const again = extractPptxText(out);
      expect(again).not.toContain('150385-4321');
      expect(again).not.toContain('anna.testesen@syntetisk-firma.test');
      expect(again).toContain('[CPR_1]');
      expect(again).toContain('Camilla Bjerregaard');
      expect(sha('syntetisk-testdata.pptx')).toBe(before);
    });
  });
});
