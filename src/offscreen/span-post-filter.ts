import { ENTITY_TYPES, type EntityType, type PiiSpan } from '../shared/message-types';

/**
 * Deterministic clean-up of the merged detections, run after patterns and the model.
 *
 * 1. Placeholder data (example.com addresses, 12345678) is never a real person's, and neither is
 *    a label this extension wrote itself ([PERSON_11]) when replaced text goes back through the check.
 * 2. A bank account guessed by the model must look like one: digits, optionally with
 *    "reg"/"konto" words, and not a product, EAN or order number.
 * 3. Attributes (job, workplace, town, birth date, salary) only matter when they belong
 *    to an identifiable person, so they are kept only when a direct identifier is
 *    detected within ATTRIBUTE_ANCHOR_CHARS (about a third of a model window).
 */
export const ATTRIBUTE_ANCHOR_CHARS = 1000;

const ATTRIBUTE_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'ORGANIZATION',
  'LOCATION',
  'JOB_TITLE',
  'BIRTH_DATE',
  'FINANCIAL_INFO',
]);

/** Low-signal types never anchor an attribute. */
const NOT_AN_ANCHOR: ReadonlySet<EntityType> = new Set<EntityType>(['DATE', 'URL', 'MISC']);

const PRIVATE_IP = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const PLACEHOLDER_EMAIL_DOMAIN = /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net|dk)$/i;

function isPlaceholderPhone(text: string): boolean {
  let digits = text.replace(/\D/g, '');
  if (digits.length > 8 && digits.startsWith('0045')) digits = digits.slice(4);
  else if (digits.length > 8 && digits.startsWith('45')) digits = digits.slice(2);
  if (digits.length !== 8) return false;
  return /^(\d)\1{7}$/.test(digits) || digits === '12345678' || digits === '87654321' || digits === '01234567' || /^123456\d\d$/.test(digits);
}

const BANK_WORDS = /\b(?:reg(?:\.?\s?nr\.?)?|registreringsnummer|konto(?:nr\.?|nummer)?|kontonummer|account|acct|iban)\b/gi;
const NOT_A_BANK_ACCOUNT_CONTEXT =
  /\b(?:ean|gtin|sku|art(?:ikel)?\.?\s?(?:nr\.?)?|varenr\.?|varenummer|ordre(?:nr\.?)?|order|faktura(?:nr\.?)?|invoice|batch|lot|model)\W{0,3}$/i;

/**
 * Cells of a spreadsheet row are joined with tabs, so "2026<TAB>125000" (a year and an amount in two cells)
 * looks like a registration number plus an account. A bank account that contains a tab is only kept when a
 * bank label stands right before it ("Reg.nr.", "Konto", "Kontonr.:") or at the start of the span itself.
 */
const BANK_LABEL_BEFORE = /\b(?:reg(?:\.?\s?nr\.?)?|regnr\.?|registreringsnummer|konto(?:nr\.?|nummer)?|kontonr\.?|kontonummer)\W{0,4}$/i;
const BANK_LABEL_AT_START = /^(?:reg|konto)/i;

function isLabelledTabAccount(span: PiiSpan, before: string): boolean {
  return BANK_LABEL_BEFORE.test(before) || BANK_LABEL_AT_START.test(span.text);
}

function isPlausibleBankAccount(text: string, before: string): boolean {
  const stripped = text.replace(BANK_WORDS, ' ');
  if (/\p{L}/u.test(stripped)) return false;
  const digits = stripped.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 20) return false;
  if (digits.length === 13) return false; // EAN-13
  return !NOT_A_BANK_ACCOUNT_CONTEXT.test(before);
}

function isAnchor(span: PiiSpan): boolean {
  if (ATTRIBUTE_TYPES.has(span.entity_type) || NOT_AN_ANCHOR.has(span.entity_type)) return false;
  if (span.entity_type === 'IP_ADDRESS' && PRIVATE_IP.test(span.text)) return false;
  return true;
}

/**
 * Span offsets are UTF-8 byte offsets. These maps convert between them and string indices;
 * plain ASCII text (the common case) needs no table.
 */
interface OffsetMap {
  toIndex(byteOffset: number): number;
  toByte(index: number): number;
}

function buildOffsetMap(text: string): OffsetMap {
  if (!/[^\x00-\x7f]/.test(text)) return { toIndex: (b) => b, toByte: (i) => i };
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) as number;
    total += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (cp > 0xffff) i++;
  }
  const byteToIndex = new Int32Array(total + 1);
  const indexToByte = new Int32Array(text.length + 1);
  let b = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    const len = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    const units = cp > 0xffff ? 2 : 1;
    for (let k = 0; k < len; k++) byteToIndex[b + k] = i;
    for (let k = 0; k < units; k++) indexToByte[i + k] = b;
    b += len;
    i += units;
  }
  byteToIndex[total] = text.length;
  indexToByte[text.length] = total;
  return {
    toIndex: (byteOffset) => byteToIndex[Math.max(0, Math.min(total, byteOffset))],
    toByte: (index) => indexToByte[Math.max(0, Math.min(text.length, index))],
  };
}

/** True for "1234 12345678xx" (with or without reg./konto), the replacement the extension writes for Danish accounts. */
function isGenericAccount(text: string, span: PiiSpan, offsets: OffsetMap): boolean {
  const compact = span.text.replace(/\s/g, '').toLowerCase();
  if (/^(?:reg\.?)?1234(?:konto)?1234567\d{3}$/.test(compact)) return true;
  if (!/^1234567\d{3}$/.test(compact)) return false;
  const at = offsets.toIndex(span.start);
  return /reg\.?\s*1234\s*(?:konto(?:nr\.?)?\s*)?$/i.test(text.slice(Math.max(0, at - 24), at));
}

const OWN_LABEL = /\[([A-Z_]+)_\d+\]/g;

/** Byte ranges of the [TYPE_n] labels this extension writes. Only real entity types count, so "[A_1]" typed by the user does not. */
function ownLabelRanges(text: string, offsets: OffsetMap): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!text.includes('[')) return ranges;
  for (const match of text.matchAll(OWN_LABEL)) {
    if (!ENTITY_TYPES.includes(match[1] as EntityType)) continue;
    const index = match.index ?? 0;
    ranges.push([offsets.toByte(index), offsets.toByte(index + match[0].length)]);
  }
  return ranges;
}

function dropPlaceholdersAndBadAccounts(text: string, spans: PiiSpan[], offsets: OffsetMap): PiiSpan[] {
  const labels = ownLabelRanges(text, offsets);
  return spans.filter((span) => {
    if (labels.some(([start, end]) => span.start >= start && span.end <= end)) return false;
    if (span.entity_type === 'EMAIL' && PLACEHOLDER_EMAIL_DOMAIN.test(span.text)) return false;
    if (span.entity_type === 'PHONE' && isPlaceholderPhone(span.text)) return false;
    // The generic account numbers the extension itself writes: 1234 12345678xx.
    if (span.entity_type === 'BANK_ACCOUNT' && isGenericAccount(text, span, offsets)) return false;
    if (span.entity_type === 'BANK_ACCOUNT' && span.text.includes('\t')) {
      const at = offsets.toIndex(span.start);
      if (!isLabelledTabAccount(span, text.slice(Math.max(0, at - 24), at))) return false;
    }
    if (span.entity_type === 'BANK_ACCOUNT' && span.source === 'ner') {
      const at = offsets.toIndex(span.start);
      return isPlausibleBankAccount(span.text, text.slice(Math.max(0, at - 14), at));
    }
    return true;
  });
}

function anchorAttributes(spans: PiiSpan[], windowChars: number): PiiSpan[] {
  const anchors = spans.filter(isAnchor).sort((a, b) => a.start - b.start);
  let maxLen = 0;
  for (const a of anchors) maxLen = Math.max(maxLen, a.end - a.start);
  return spans.filter((span) => {
    if (!ATTRIBUTE_TYPES.has(span.entity_type)) return true;
    // First anchor that could still be within reach: start >= span.start - window - maxLen.
    let lo = 0;
    let hi = anchors.length;
    const floor = span.start - windowChars - maxLen;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid].start < floor) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < anchors.length; i++) {
      const a = anchors[i];
      if (a.start - windowChars >= span.end) break;
      if (a.start - windowChars < span.end && a.end + windowChars > span.start) return true;
    }
    return false;
  });
}

/**
 * Words that are also first names or surnames but are far more often ordinary words or places,
 * so a later bare occurrence is not treated as the same person.
 */
const NAME_PROPAGATION_STOPWORDS: ReadonlySet<string> = new Set([
  'hans', 'bent', 'else', 'mark', 'rose', 'will', 'grace', 'hope', 'lund', 'holm', 'berg', 'dam', 'strand',
  'skov', 'bak', 'vind', 'smed', 'fisker', 'kok', 'mand', 'fru', 'herr', 'kong', 'dronning', 'prins', 'sankt',
  'april', 'maj', 'juni', 'juli', 'august', 'marts', 'januar', 'februar', 'oktober', 'november', 'december',
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'march', 'june', 'july', 'september',
]);

const MAX_PROPAGATED_TOKENS = 800;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A person is often named in full once and then by first name or surname only
 * ("Rikke Hansen ... Rikke mener ..."). Flag later bare occurrences of every capitalised
 * name token (4+ letters) of a detected person, so the anonymised text stays consistent.
 */
function propagateNames(text: string, spans: PiiSpan[], offsets: OffsetMap): PiiSpan[] {
  const tokens = new Set<string>();
  for (const span of spans) {
    if (span.entity_type !== 'PERSON') continue;
    for (const raw of span.text.split(/[\s-]+/)) {
      const token = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (token.length >= 4 && /^\p{Lu}\p{Ll}+$/u.test(token) && !NAME_PROPAGATION_STOPWORDS.has(token.toLowerCase())) {
        tokens.add(token);
      }
    }
  }
  if (tokens.size === 0 || tokens.size > MAX_PROPAGATED_TOKENS) return spans;

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${[...tokens].map(escapeRegExp).join('|')})(?:s)?(?![\\p{L}\\p{N}])`,
    'gu'
  );
  const taken = spans.slice().sort((a, b) => a.start - b.start);
  const overlapsExisting = (start: number, end: number): boolean => {
    let lo = 0;
    let hi = taken.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (taken[mid].end <= start) lo = mid + 1;
      else hi = mid;
    }
    return lo < taken.length && taken[lo].start < end;
  };

  const added: PiiSpan[] = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    const index = match.index ?? 0;
    const start = offsets.toByte(index);
    const end = offsets.toByte(index + name.length);
    if (overlapsExisting(start, end)) continue;
    added.push({ start, end, entity_type: 'PERSON', score: 0.6, text: name, source: 'ner' });
  }
  return added.length === 0 ? spans : [...spans, ...added].sort((a, b) => a.start - b.start);
}

export function applySpanPostFilters(
  text: string,
  spans: PiiSpan[],
  options: { anchorAttributes?: boolean; anchorChars?: number; propagateNames?: boolean } = {}
): PiiSpan[] {
  const offsets = buildOffsetMap(text);
  const cleaned = dropPlaceholdersAndBadAccounts(text, spans, offsets);
  const anchored =
    options.anchorAttributes === false ? cleaned : anchorAttributes(cleaned, options.anchorChars ?? ATTRIBUTE_ANCHOR_CHARS);
  return options.propagateNames === false ? anchored : propagateNames(text, anchored, offsets);
}
