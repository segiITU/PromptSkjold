export type SyntheticLocale = 'da' | 'en';
export type SyntheticLocaleSetting = 'auto' | SyntheticLocale;

const DANISH_WORDS = new Set([
  'og', 'jeg', 'er', 'det', 'at', 'til', 'med', 'har', 'ikke', 'min', 'mit', 'mine', 'en', 'et', 'på',
  'af', 'for', 'som', 'kan', 'vil', 'skal', 'hun', 'han', 'vi', 'du', 'der', 'den', 'de', 'hvad',
  'fra', 'om', 'men', 'hej', 'tak', 'bor', 'hedder', 'din', 'dit', 'vores', 'være', 'blev', 'også',
]);

/**
 * Rough guess at whether a text is Danish. Letters only Danish uses count as
 * strong evidence; otherwise common Danish function words must make up a
 * fair share of the words. Short or ambiguous text counts as English.
 */
export function looksDanish(text: string): boolean {
  const sample = text.slice(0, 4000).toLowerCase();
  if ((sample.match(/[æøå]/g) ?? []).length >= 2) return true;
  const words = sample.match(/\p{L}+/gu) ?? [];
  if (words.length < 5) return false;
  const hits = words.filter((w) => DANISH_WORDS.has(w)).length;
  return hits / words.length >= 0.12;
}

export function resolveSyntheticLocale(setting: SyntheticLocaleSetting, text: string): SyntheticLocale {
  if (setting === 'da' || setting === 'en') return setting;
  return looksDanish(text) ? 'da' : 'en';
}
