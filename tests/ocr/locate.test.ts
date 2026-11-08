import { locateEverywhere, locateItems, scaleBox } from '../../src/ocr/locate';
import type { OcrWord } from '../../src/ocr/types';

const word = (text: string, x: number, y = 0): OcrWord => ({
  text,
  confidence: 90,
  box: { x0: x, y0: y, x1: x + 10, y1: y + 10 },
});

describe('locateItems', () => {
  const words = [
    word('CPR-nr.:', 0),
    word('140692-1234', 20),
    word('Mikkel', 40, 20),
    word('Rask-Bendtsen,', 60, 20),
    word('tlf', 0, 40),
    word('51', 20, 40),
    word('77', 40, 40),
    word('20', 60, 40),
    word('96', 80, 40),
  ];

  test('finds a single word, ignoring punctuation', () => {
    expect(locateItems(words, ['140692-1234'])).toEqual([[words[1].box]]);
  });

  test('finds an item spread over several words', () => {
    expect(locateItems(words, ['Mikkel Rask-Bendtsen'])).toEqual([[words[2].box, words[3].box]]);
    expect(locateItems(words, ['51 77 20 96'])[0]).toHaveLength(4);
  });

  test('repeated items take successive occurrences', () => {
    const two = [word('Anders', 0), word('og', 20), word('Anders', 40)];
    const [a, b] = locateItems(two, ['Anders', 'Anders']);
    expect(a).toEqual([two[0].box]);
    expect(b).toEqual([two[2].box]);
  });

  test('an item that is not in the words gets an empty list', () => {
    expect(locateItems(words, ['Fatima'])).toEqual([[]]);
  });

  test('a short item never matches inside a longer word', () => {
    expect(locateItems([word('Andersen', 0)], ['And'])).toEqual([[]]);
  });

  test('an item inside a longer word covers that word', () => {
    expect(locateItems([word('(s.kjaerulf@aab.dk,', 0)], ['s.kjaerulf@aab.dk'])[0]).toHaveLength(1);
  });
});

describe('items that are only part of a word', () => {
  test('a fragment of an identifier covers the whole word, so the rest never stays visible', () => {
    const words = [word('Kørekort:', 0), word('DK-8837-2201', 20)];
    expect(locateItems(words, ['DK'])).toEqual([[words[1].box]]);
    expect(locateEverywhere(words, ['DK']).boxes).toEqual([words[1].box]);
  });

  test('an email read as one word is found from its parts', () => {
    const words = [word('Mail:', 0), word('mikkel.rask@mail.dk', 20)];
    expect(locateItems(words, ['mikkel.rask@mail.dk'])).toEqual([[words[1].box]]);
  });

  test('an item spread over words that each contain punctuation', () => {
    const words = [word('Jægergårdsgade', 0), word('118,', 20), word('3.', 40), word('tv', 60)];
    expect(locateItems(words, ['Jægergårdsgade 118, 3. tv'])[0]).toHaveLength(4);
  });

  test('a short fragment still never matches inside a longer piece', () => {
    expect(locateItems([word('Andersen-Holm', 0)], ['And'])).toEqual([[]]);
  });
});

describe('OCR misreads', () => {
  test('look-alike characters are folded: I/l and dropped Danish letters', () => {
    expect(locateItems([word('2026-PIl-1045', 0)], ['2026-PII-1045'])[0]).toHaveLength(1);
    expect(locateItems([word('Bjorn', 0), word('Hojeng', 20)], ['Bjørn Højeng'])[0]).toHaveLength(2);
    expect(locateItems([word('Fabelstraede', 0), word('29', 20)], ['Fabelstræde 29'])[0]).toHaveLength(2);
  });

  test('a name or email one misread character off still matches', () => {
    expect(locateItems([word('bjoern.vesterkaer@lindepost.invaiid', 0)], ['bjoern.vesterkaer@lindepost.invalid'])[0]).toHaveLength(1);
    expect(locateItems([word('Larsan', 0)], ['Larsen'])).toEqual([[]]); // under 8 characters: exact only
    expect(locateItems([word('Søren', 0), word('Kjærsvamg', 20)], ['Søren Kjærsvang'])[0]).toHaveLength(2);
  });

  test('a case number with an extra misread character still matches', () => {
    expect(locateItems([word('2026-PIl-1046', 0)], ['2026-PI11-1046'])[0]).toHaveLength(1);
  });

  test('numbers must match exactly: a CPR one digit off is not painted', () => {
    expect(locateItems([word('041180-4004', 0)], ['041180-4003'])).toEqual([[]]);
    expect(locateItems([word('0040', 0), word('4400116248', 20)], ['0040 4400116247'])).toEqual([[]]);
  });

  test('a tolerant match never swallows a neighbouring word', () => {
    const words = [word('Åse', 0), word('Bøgh', 20), word('Nørrelund', 40), word('og', 60), word('på', 80)];
    expect(locateEverywhere(words, ['Åse Bøgh Nørrelnd']).boxes).toEqual([words[0].box, words[1].box, words[2].box]);
  });

  test('a name whose ø and æ were read as o, a and z is found by its consonants', () => {
    const words = [word('Skatteyder:', 0), word('Bjorn', 20), word('Hajeng', 40), word('Vesterkzer', 60), word('-', 80)];
    const name = 'Bjørn Højeng Vesterkær';
    expect(locateItems(words, [name])[0]).toEqual([words[1].box, words[2].box, words[3].box]);
    expect(locateEverywhere(words, [name]).boxes).toEqual([words[1].box, words[2].box, words[3].box]);
  });

  test('every occurrence is covered: the same address read exactly in a footer and garbled in the body', () => {
    const words = [
      word('Fabelstreede', 0), word('29,', 20), word('4.', 40), word('tv.,', 60), word('6700', 80), word('Esbjerg', 100),
      word('Side', 0, 40), word('1', 20, 40),
      word('Fabelstraede', 0, 80), word('29,', 20, 80), word('4.', 40, 80), word('tv.,', 60, 80), word('6700', 80, 80), word('Esbjerg', 100, 80),
    ];
    const boxes = locateEverywhere(words, ['Fabelstræde 29, 4. tv., 6700 Esbjerg']).boxes;
    expect(boxes).toHaveLength(12);
    expect(boxes).not.toContain(words[6].box);
  });

  test('words already painted are not painted again by the consonant match', () => {
    const words = [word('Bjorn', 0), word('Hajeng', 20), word('Vesterkzer', 40)];
    expect(locateEverywhere(words, ['Bjørn Højeng Vesterkær', 'Bjørn Højeng Vesterkær']).boxes).toHaveLength(3);
  });

  test('the consonant match needs enough consonants and letters, and never applies to numbers', () => {
    expect(locateItems([word('Hans', 0)], ['Hanse'])).toEqual([[]]);
    expect(locateItems([word('041180-4004', 0)], ['041180-4003'])).toEqual([[]]);
  });

  test('an exact occurrence wins over a near one', () => {
    const words = [word('Kjærsvamg', 0), word('Kjærsvang', 20)];
    expect(locateItems(words, ['Kjærsvang'])).toEqual([[words[1].box]]);
    expect(locateEverywhere(words, ['Kjærsvang']).boxes).toEqual([words[1].box, words[0].box]);
  });
});

describe('scaleBox', () => {
  test('scales all sides', () => {
    expect(scaleBox({ x0: 10, y0: 20, x1: 30, y1: 40 }, 0.5)).toEqual({ x0: 5, y0: 10, x1: 15, y1: 20 });
  });
});
