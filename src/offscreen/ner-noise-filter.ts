import type { PiiSpan } from '../shared/message-types';

/**
 * Words a token-classification model sometimes tags as PII although they are
 * never personal data: log levels, HTTP verbs, literals and generic role words.
 * Matched against the whole span text, case-insensitively.
 */
const NEVER_PII_WORDS: ReadonlySet<string> = new Set([
  'info', 'warn', 'warning', 'error', 'debug', 'trace', 'fatal', 'notice', 'critical',
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options',
  'null', 'none', 'true', 'false', 'undefined', 'nan',
  'customer', 'customers', 'user', 'users', 'client', 'clients', 'admin', 'administrator', 'guest',
  'kunde', 'kunder', 'bruger', 'brugere', 'klient',
  // Form placeholders
  'navn', 'fornavn', 'efternavn', 'fornavn efternavn', 'vejnavn', 'name', 'first name', 'last name',
  'full name', 'your name', 'john doe', 'jane doe',
]);

/**
 * Straits, seas, islands and regions. They name places, not people's homes, and
 * a sentence like "jeg har svoemmet over Oeresund" is not personal data.
 * Matched against the whole LOCATION span, case-insensitively.
 */
const GEOGRAPHIC_FEATURES: ReadonlySet<string> = new Set([
  'øresund', 'storebælt', 'lillebælt', 'kattegat', 'skagerrak', 'limfjorden', 'nordsøen', 'østersøen',
  'vadehavet', 'roskilde fjord', 'isefjord', 'kalundborg fjord', 'ringkøbing fjord', 'mariager fjord',
  'sjælland', 'fyn', 'jylland', 'bornholm', 'lolland', 'falster', 'møn', 'samsø', 'ærø', 'læsø',
  'anholt', 'hven', 'amager', 'langeland', 'als', 'fanø', 'rømø', 'mors', 'thy', 'himmerland', 'djursland',
  'skåne', 'slesvig', 'holsten', 'nordjylland', 'midtjylland', 'sydjylland', 'sønderjylland', 'vestjylland',
  'østjylland', 'nordsjælland', 'sydsjælland', 'vestsjælland', 'sydfyn', 'nordfyn', 'vestfyn',
  'zealand', 'funen', 'jutland', 'oresund', 'øresundsregionen', 'baltic sea', 'north sea', 'the baltic',
]);

/**
 * Countries, continents and world regions. A country on its own does not
 * identify anyone, and models tag them as LOCATION in every geography question.
 * English and Danish names.
 */
const COUNTRIES_AND_REGIONS: ReadonlySet<string> = new Set([
  'denmark', 'danmark', 'sweden', 'sverige', 'norway', 'norge', 'finland', 'iceland', 'island',
  'germany', 'tyskland', 'france', 'frankrig', 'spain', 'spanien', 'italy', 'italien', 'portugal',
  'netherlands', 'holland', 'nederlandene', 'belgium', 'belgien', 'switzerland', 'schweiz',
  'austria', 'østrig', 'poland', 'polen', 'ireland', 'irland', 'greece', 'grækenland', 'turkey',
  'tyrkiet', 'russia', 'rusland', 'ukraine', 'united kingdom', 'uk', 'england', 'scotland',
  'skotland', 'wales', 'great britain', 'storbritannien', 'britain', 'usa', 'us', 'united states',
  'america', 'amerika', 'canada', 'mexico', 'brazil', 'brasilien', 'argentina', 'chile',
  'china', 'kina', 'japan', 'india', 'indien', 'pakistan', 'australia', 'australien',
  'new zealand', 'new zealand', 'south africa', 'sydafrika', 'egypt', 'egypten', 'morocco',
  'marokko', 'nigeria', 'kenya', 'israel', 'iran', 'iraq', 'irak', 'syria', 'syrien', 'saudi arabia',
  'saudi-arabien', 'thailand', 'vietnam', 'indonesia', 'indonesien', 'south korea', 'sydkorea',
  'greenland', 'grønland', 'faroe islands', 'færøerne', 'europe', 'europa', 'asia', 'asien',
  'africa', 'afrika', 'north america', 'nordamerika', 'south america', 'sydamerika', 'oceania',
  'oceanien', 'antarctica', 'antarktis', 'scandinavia', 'skandinavien', 'the nordics', 'norden',
  'the alps', 'alperne', 'eu', 'the eu',
]);

function normalize(text: string): string {
  return text.trim().replace(/^[\s"'([{]+|[\s"')\]}.,;:!?]+$/g, '').toLowerCase();
}

/** True for a span that should be dropped as model noise. */
export function isNerNoise(span: Pick<PiiSpan, 'entity_type' | 'text'>): boolean {
  const normalized = normalize(span.text);
  if (normalized.length === 0) return true;
  if (NEVER_PII_WORDS.has(normalized)) return true;
  if (span.entity_type === 'LOCATION' && COUNTRIES_AND_REGIONS.has(normalized)) return true;
  if (span.entity_type === 'LOCATION' && GEOGRAPHIC_FEATURES.has(normalized)) return true;
  return false;
}

export function dropNerNoise<T extends Pick<PiiSpan, 'entity_type' | 'text'>>(spans: readonly T[]): T[] {
  return spans.filter((span) => !isNerNoise(span));
}

/**
 * Cheap prose test for long pastes. Names, organisations, places and street
 * names are written with a capital letter, so a chunk without a single
 * capitalised word (typically logs, hex dumps, minified or numeric data) is
 * very unlikely to hold anything only a language model can find. Pattern
 * rules still run on every character.
 */
export function capitalizedWordCount(text: string): number {
  const matches = text.match(/(?<![\p{L}\p{N}])\p{Lu}\p{Ll}{1,}/gu);
  return matches ? matches.length : 0;
}

/**
 * Models sometimes include the comma or colon that follows a name
 * ("Lars Pedersen,"). Trim those so the replacement keeps the punctuation.
 * Only ASCII characters are removed, so byte and character offsets agree.
 */
export function trimTrailingPunctuation<T extends Pick<PiiSpan, 'end' | 'text'>>(spans: readonly T[]): T[] {
  return spans.map((span) => {
    const trimmed = span.text.replace(/[,;:\s]+$/, '');
    if (trimmed.length === 0 || trimmed.length === span.text.length) return span;
    return { ...span, text: trimmed, end: span.end - (span.text.length - trimmed.length) };
  });
}
