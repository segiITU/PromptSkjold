import { cleanOcrText, repairAtSigns } from '../../src/ocr/postprocess';

describe('repairAtSigns', () => {
  test.each([
    ['mette.hansen Q gmail.com', 'mette.hansen@gmail.com'],
    ['lars©firma.dk', 'lars@firma.dk'],
    ['kontakt: bo & virksomhed.dk', 'kontakt: bo@virksomhed.dk'],
  ])('%s', (input, expected) => {
    expect(repairAtSigns(input)).toBe(expected);
  });

  test('leaves ordinary text alone', () => {
    expect(repairAtSigns('Q1 salg & marketing i 2025')).toBe('Q1 salg & marketing i 2025');
  });
});

describe('cleanOcrText', () => {
  test('normalises line endings and blank runs', () => {
    expect(cleanOcrText('a  \r\n\r\n\r\n\r\nb\n')).toBe('a\n\nb');
  });
});
