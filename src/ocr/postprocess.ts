/**
 * Tesseract often reads the "@" in an address as a look-alike. Repair it, but
 * only when a word-like part comes before and a domain comes after, so
 * ordinary text containing "Q" or "&" is left alone.
 */
const AT_LOOKALIKE =
  /(?<=[A-Za-z0-9._-])[ \t]?[æ&©@Q]{1,2}[ \t]?(?=[A-Za-z0-9-]+\.(?:dk|com|org|net|eu|de|se|no)(?![A-Za-z]))/g;

export function repairAtSigns(text: string): string {
  return text.replace(AT_LOOKALIKE, '@');
}

/** Normalise engine output before it goes to the PII detector. */
export function cleanOcrText(text: string): string {
  return repairAtSigns(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
