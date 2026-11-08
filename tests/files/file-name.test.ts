import { cleanFileName, joinNameAndBody, nameForDetection, neutralFileName, splitFileName } from '../../src/files/file-name';
import type { PiiSpan } from '../../src/shared/message-types';

const span = (text: string, whole: string, entity_type: PiiSpan['entity_type'] = 'PERSON'): PiiSpan => {
  const start = whole.indexOf(text);
  return { start, end: start + text.length, entity_type, score: 0.9, text, source: 'ner' };
};

describe('splitFileName', () => {
  test.each([
    ['Lønseddel_Mette_Hansen.pdf', 'Lønseddel_Mette_Hansen', '.pdf'],
    ['report.final.docx', 'report.final', '.docx'],
    ['README', 'README', ''],
    ['.gitignore', '.gitignore', ''],
    ['scan.', 'scan', '.'],
  ])('%s', (name, stem, ext) => {
    expect(splitFileName(name)).toEqual({ stem, ext });
  });
});

test('the detector reads underscores as spaces without moving anything', () => {
  const stem = 'Lønseddel_Mette_Hansen_010190';
  expect(nameForDetection(stem)).toBe('Lønseddel Mette Hansen 010190');
  expect(nameForDetection(stem)).toHaveLength(stem.length);
});

describe('joinNameAndBody', () => {
  const body = 'Mette Hansen tjener 48.500';
  const name = 'Lønseddel Mette Hansen';
  const nameSpans = [span('Mette Hansen', name)];
  const bodySpans = [span('Mette Hansen', body), span('48.500', body, 'FINANCIAL_INFO')];

  test('with no finding in the name, nothing changes', () => {
    const joined = joinNameAndBody('Filnavn: ', 'Lønseddel_Mette_Hansen.pdf', [], body, bodySpans);
    expect(joined.text).toBe(body);
    expect(joined.spans).toEqual(bodySpans);
    expect(joined.fileName([{ start: 0, end: 12, text: '[PERSON_1]' }])).toBe('Lønseddel_Mette_Hansen.pdf');
  });

  test('the name comes first, and every span points at the right words in the joined text', () => {
    const joined = joinNameAndBody('Filnavn: ', 'Lønseddel_Mette_Hansen.pdf', nameSpans, body, bodySpans);
    expect(joined.text.startsWith('Filnavn: Lønseddel Mette Hansen\n\n')).toBe(true);
    expect(joined.spans).toHaveLength(3);
    for (const s of joined.spans) expect(joined.text.slice(s.start, s.end)).toBe(s.text);
    expect(joined.spans.filter((s) => joined.isName(s))).toHaveLength(1);
  });

  test('spans and replacements are mapped back to the body and the name', () => {
    const joined = joinNameAndBody('Filnavn: ', 'Lønseddel_Mette_Hansen.pdf', nameSpans, body, bodySpans);
    const [nameSpan, ...bodyShifted] = joined.spans;
    expect(joined.bodySpans(joined.spans)).toEqual(bodySpans);
    expect(joined.unshift(bodyShifted[1])).toEqual(bodySpans[1]);

    const replacements = joined.spans.map((s, i) => ({ start: s.start, end: s.end, text: `[X_${i}]` }));
    expect(nameSpan.start).toBe(replacements[0].start);
    expect(joined.bodyReplacements(replacements)).toEqual([
      { start: 0, end: 12, text: '[X_1]' },
      { start: body.indexOf('48.500'), end: body.indexOf('48.500') + 6, text: '[X_2]' },
    ]);
    expect(joined.fileName(replacements)).toBe('Lønseddel_[X_0].pdf');
  });

  test('a name the user left alone keeps its name', () => {
    const joined = joinNameAndBody('Filnavn: ', 'Lønseddel_Mette_Hansen.pdf', nameSpans, body, bodySpans);
    const onlyBody = joined.spans.filter((s) => !joined.isName(s)).map((s) => ({ start: s.start, end: s.end, text: 'X' }));
    expect(joined.fileName(onlyBody)).toBe('Lønseddel_Mette_Hansen.pdf');
  });

  test('an empty body still gives a review of the name', () => {
    const joined = joinNameAndBody('Filnavn: ', 'Mette_Hansen.png', [span('Mette Hansen', 'Mette Hansen')], '', []);
    expect(joined.text).toBe('Filnavn: Mette Hansen');
    expect(joined.bodySpans(joined.spans)).toEqual([]);
  });
});

describe('neutralFileName', () => {
  test('keeps only the extension, and the number tells files of one selection apart', () => {
    expect(neutralFileName('Lønseddel_Mette_Hansen.pdf', 1)).toBe('dokument-1.pdf');
    expect(neutralFileName('foto.JPG', 3)).toBe('dokument-3.JPG');
    expect(neutralFileName('README', 2)).toBe('dokument-2');
  });
});

describe('cleanFileName', () => {
  test('applies the replacements to the name and keeps the extension', () => {
    expect(cleanFileName('CV_Anders_Jensen_cpr-010190.docx', [{ start: 3, end: 16, text: '[PERSON_1]' }, { start: 21, end: 27, text: '[CPR_1]' }]))
      .toBe('CV_[PERSON_1]_cpr-[CPR_1].docx');
  });

  test('characters a file system rejects become underscores', () => {
    expect(cleanFileName('a b.txt', [{ start: 0, end: 3, text: 'Jo/hn: "X"?' }])).toBe('Jo_hn_ _X__.txt');
  });

  test('a name that is empty afterwards gets a neutral one', () => {
    expect(cleanFileName('Mette.pdf', [{ start: 0, end: 5, text: '' }])).toBe('dokument-1.pdf');
    expect(cleanFileName('Mette', [{ start: 0, end: 5, text: ' . ' }])).toBe('dokument-1');
  });

  test('no replacements, no change', () => {
    expect(cleanFileName('plain.txt', [])).toBe('plain.txt');
  });
});
