/**
 * Privacy Guardrail — Synthetic Value Pool
 *
 * Generates realistic-but-clearly-fake replacements for detected PII so that
 * downstream LLMs receive natural-looking text rather than awkward
 * placeholder tokens like [PERSON_1]. The synthetic value is recorded once,
 * per identity, in the IdentityVault and reused on every subsequent paste —
 * giving the user consistent, cross-session, cross-provider replacements.
 *
 * Design rules:
 * - **Unstructured types** (PERSON, EMAIL, LOCATION, ORGANIZATION,
 *   ADDRESS, USERNAME, MISC): drawn from curated pools of safe, neutral,
 *   obviously-not-real values. Picks gender-neutral / multicultural names
 *   to minimise cultural bias and avoids names of public figures.
 * - **Structured types** (CREDIT_CARD, SSN, IBAN, IP_ADDRESS, PHONE,
 *   BANK_ACCOUNT): use officially reserved test values from the relevant
 *   standards (RFC 5737 TEST-NET-1, IRS test SSN range, etc.) so that any
 *   accidental leakage downstream cannot collide with real-world values.
 * - **Sensitive types** (PASSWORD, URL, DATE): synthetic mode falls back
 *   to the typed placeholder. Generating fake passwords/URLs is high-risk
 *   (could look credential-like to scanners) and date arithmetic depends
 *   on context the vault doesn't currently track.
 *
 * The pool is finite. The vault is responsible for cycling: when the pool
 * is exhausted for a given type, the generator appends a numeric suffix
 * to keep producing unique values.
 */

import type { EntityType } from './message-types';
import type { SyntheticLocale } from './language';

/** Names chosen for being recognisable as Western-style but not associated
 *  with prominent public figures. Mix of single and multi-cultural roots. */
const PERSON_POOL: readonly string[] = [
  'Jordan Park',
  'Casey Morrow',
  'Avery Quinn',
  'Riley Bennett',
  'Morgan Sato',
  'Sage Carrillo',
  'Quinn Holloway',
  'Reese Aldana',
  'Hayden Pereira',
  'Devon Tatsumi',
  'Emery Coleman',
  'Skyler Bishop',
  'Rowan Esposito',
  'Cameron Liu',
  'Drew Whitfield',
  'Logan Marquez',
  'Phoenix Andrade',
  'Tatum Okafor',
  'Noor Aldridge',
  'Aspen Fontaine',
  'Indigo Ramos',
  'Wren Sutherland',
  'Ellis Vargas',
  'Frankie Bowen',
];

const LOCATION_POOL: readonly string[] = [
  'Springwood',
  'Bridgewater',
  'Northvale',
  'Cedar Hollow',
  'Westmoor',
  'Stonebrook',
  'Fairhaven',
  'Riverbend',
  'Hillcrest',
  'Oakridge',
  'Pinewell',
  'Brookline Park',
  'Lakeshore',
  'Foxglen',
  'Maple Heights',
  'Silverpoint',
];

const ORGANIZATION_POOL: readonly string[] = [
  'Quantum Ridge Industries',
  'Atlas Group',
  'Midwest Holdings',
  'Northstar Solutions',
  'Cobalt Logistics',
  'Vertex Manufacturing',
  'Greenline Partners',
  'Harborwave Capital',
  'Ironcrest Software',
  'Silverthorn Media',
  'Pinepoint Research',
  'Brightwater Systems',
  'Cedarpath Consulting',
  'Lumiscope Labs',
  'Foxhaven Enterprises',
  'Riftgate Holdings',
];

const ADDRESS_POOL: readonly string[] = [
  '742 Evergreen Ln',
  '1521 Maple Ave',
  '38 Foxglove Rd',
  '904 Cedar Hollow Dr',
  '227 Westmoor Ct',
  '610 Hawthorn St',
  '1843 Brookline Way',
  '76 Pineapple Ridge',
  '350 Aurora Pkwy',
  '1109 Linden Cir',
  '85 Birchcrest Ter',
  '6204 Silverpoint Ave',
];

const USERNAME_POOL: readonly string[] = [
  'parkour_jordan',
  'casey_dev',
  'avery_2025',
  'riley_writes',
  'morgan_codes',
  'sage_says',
  'quinn_q',
  'reese_reader',
  'hayden_makes',
  'devon_dev',
];

const MISC_POOL: readonly string[] = [
  'Project Bluebird',
  'Initiative Echo',
  'Item Falcon',
  'Reference Spruce',
  'Codename Lantern',
  'Token Mariner',
];

/** Email synthetic uses a safe domain reserved for examples (RFC 2606). */
const EMAIL_DOMAIN_POOL: readonly string[] = [
  'example.com',
  'example.org',
  'example.net',
];

/** Reserved test phone numbers (NANP 555-01xx range, used by film/TV). */
const PHONE_POOL: readonly string[] = [
  '+1 (555) 010-0123',
  '+1 (555) 010-0145',
  '+1 (555) 010-0167',
  '+1 (555) 010-0189',
  '+1 (555) 010-0211',
  '+1 (555) 010-0233',
];

/** Test credit card numbers — well-known industry test values, Luhn-valid,
 *  but flagged by every payment processor as test data so they cannot
 *  process. */
const CREDIT_CARD_POOL: readonly string[] = [
  '4111 1111 1111 1111', // Visa test
  '5555 5555 5555 4444', // MasterCard test
  '3782 822463 10005',   // Amex test
  '6011 1111 1111 1117', // Discover test
];

/** SSNs in the reserved IRS test range (900-92-XXXX area not assigned). */
const SSN_POOL: readonly string[] = [
  '900-92-0001',
  '900-92-0042',
  '900-92-0117',
  '900-92-0234',
  '900-92-0367',
];

/** Fictional CPRs with valid dates and obviously artificial sequence numbers. */
const CPR_POOL: readonly string[] = [
  '010150-0001',
  '020250-0002',
  '030350-0003',
  '040450-0004',
  '050550-0005',
];

/** IBANs that pass mod-97 check but use the documentation country GB
 *  with the well-known test bank "TEST". */
const IBAN_POOL: readonly string[] = [
  'GB82 WEST 1234 5698 7654 32',
  'DE89 3704 0044 0532 0130 00',
  'FR14 2004 1010 0505 0001 3M02 606',
];

/** RFC 5737 reserved IPs for documentation (TEST-NET-1/2/3). */
const IP_POOL: readonly string[] = [
  '192.0.2.10',
  '192.0.2.42',
  '198.51.100.7',
  '198.51.100.55',
  '203.0.113.21',
  '203.0.113.99',
];

/** Bank account numbers — pure invented digit strings prefixed with 9999
 *  which is not in IBAN or routing-number space. */
const BANK_ACCOUNT_POOL: readonly string[] = [
  '9999 0001 2345 6701',
  '9999 0001 9876 5432',
  '9999 0002 1357 9024',
];

/**
 * Danish pools, used when the text being protected is Danish. The aim is values
 * that do not belong to anyone: first names are common, but surnames, towns and
 * company names are invented compounds (so a real person or firm is unlikely to
 * match, though that cannot be guaranteed). Numbers are plainly generic: CPR
 * 123456-7890 (not a valid date), phone +45 12345678, postcode 1234. Each new value
 * counts up by one, so two different people never share a replacement and the
 * answer can be mapped back.
 */
/** Bumped when the Danish pools change, so records made from older ones are refreshed. */
export const DANISH_POOL_REVISION = 2;

const DA_PERSON_POOL: readonly string[] = [
  'Mads Askelvig', 'Sofie Bolmstrup', 'Kasper Dyrnæs', 'Emma Elmtoft', 'Jonas Frostmark',
  'Ida Gyldenvang', 'Rasmus Holmtrup', 'Freja Kjelvig', 'Anders Lyngtoft', 'Camilla Mørkvang',
  'Peter Nyvold', 'Maja Skelmark', 'Søren Tovstrup', 'Laura Vindtoft', 'Henrik Ølvang',
  'Nanna Aagetoft', 'Thomas Bregnvig', 'Katrine Dalmark', 'Christian Fjeldvang', 'Julie Gammeltoft',
  'Mikkel Havrevold', 'Signe Kolstrup', 'Frederik Lundmark', 'Louise Mosevang',
];

const DA_LOCATION_POOL: readonly string[] = [
  'Askeholt', 'Bregnby', 'Dalvang', 'Elmstrup', 'Fjeldby', 'Gyldtoft',
  'Havrevig', 'Kolsted', 'Lyngmark', 'Mosevig', 'Nyvang', 'Tovsted',
];

const DA_ORGANIZATION_POOL: readonly string[] = [
  'Velmora ApS', 'Tavelund Rådgivning ApS', 'Norvane A/S', 'Brevinna Consult ApS',
  'Solvik Teknik A/S', 'Mandrik Regnskab ApS', 'Fyrelle Design ApS', 'Noventa Byg A/S',
  'Kerlund Handel ApS', 'Aldrevik Partner ApS', 'Hyldtoft Nord A/S', 'Ravelde Service ApS',
];

const DA_ADDRESS_POOL: readonly string[] = [
  'Birkevænget 14, 1234 Askeholt',
  'Elmegade 7, 2. th., 1234 Bregnby',
  'Skovvej 52, 1234 Dalvang',
  'Engholmen 3, 1. tv., 1234 Elmstrup',
  'Kirkestræde 21, 1234 Fjeldby',
  'Mølleparken 9, 1234 Gyldtoft',
  'Havnevej 88, 1234 Havrevig',
  'Søndergade 30, st., 1234 Kolsted',
];

const DA_USERNAME_POOL: readonly string[] = [
  'mads_ask', 'sofie_b', 'kasper_dyr', 'emma_e2025', 'jonas_fm',
  'ida_gyld', 'rasmus_h', 'freja_kj', 'anders_lyng', 'camilla_mo',
];

const DA_MISC_POOL: readonly string[] = [
  'Projekt Blåfugl', 'Initiativ Ekko', 'Sag Falk', 'Reference Gran', 'Kodenavn Lanterne', 'Mærke Havørn',
];

/**
 * Generic numbers for Danish text, counting up from the pattern the user chose so
 * that every identity gets its own value.
 */
const daCpr = (index: number): string => `123456-${String(7890 + (index % 2110)).padStart(4, '0')}`;
const daPhone = (index: number): string => `+45 ${12345678 + index}`;
const daIban = (index: number): string => {
  const digits = String(12345678901234 + index); // 14 digits, as in a Danish IBAN
  return `DK00 ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12)}`;
};
// Numbers only: the detected item may or may not include the words "reg." and "konto".
const daBankAccount = (index: number): string => `1234 ${1234567890 + index}`;

/** Pick the n-th value from a pool, with deterministic suffix when the
 *  pool is exhausted so the generator never returns duplicates. */
function pickFromPool(pool: readonly string[], index: number): string {
  if (index < pool.length) {
    return pool[index];
  }
  const base = pool[index % pool.length];
  const cycle = Math.floor(index / pool.length) + 1;
  return appendCycleSuffix(base, cycle);
}

function appendCycleSuffix(base: string, cycle: number): string {
  // For numeric values, append a digit; for textual values, append a numeric suffix.
  if (/^[\d\s+\-()]+$/.test(base)) {
    // Numeric — replace the last digit-block in a deterministic way
    return `${base}-${cycle}`;
  }
  return `${base} ${cycle}`;
}

function buildEmail(personName: string, index: number): string {
  const localBase = personName
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const domain = EMAIL_DOMAIN_POOL[index % EMAIL_DOMAIN_POOL.length];
  return `${localBase}@${domain}`;
}

/**
 * Generate a synthetic value for a given entity type.
 *
 * @param entityType — the PII entity type to generate for.
 * @param index — monotonic counter per type (vault assigns this), used to
 *   pick an unused value from the pool deterministically.
 * @param context — optional contextual hints. `personSeed` lets EMAIL
 *   generation reuse a person's synthetic name as the email local part so
 *   `Jordan Park <jordan.park@example.com>` stays internally consistent.
 *   `locale` picks the Danish or English pools (English when absent).
 * @returns the synthetic value, or `null` if the type opts out (the caller
 *   should fall back to the typed placeholder).
 */
export function generateSyntheticValue(
  entityType: EntityType,
  index: number,
  context?: { personSeed?: string; locale?: SyntheticLocale },
): string | null {
  const da = context?.locale === 'da';
  switch (entityType) {
    case 'PERSON':
      return pickFromPool(da ? DA_PERSON_POOL : PERSON_POOL, index);
    case 'LOCATION':
      return pickFromPool(da ? DA_LOCATION_POOL : LOCATION_POOL, index);
    case 'ORGANIZATION':
      return pickFromPool(da ? DA_ORGANIZATION_POOL : ORGANIZATION_POOL, index);
    case 'ADDRESS':
      return pickFromPool(da ? DA_ADDRESS_POOL : ADDRESS_POOL, index);
    case 'USERNAME':
      return pickFromPool(da ? DA_USERNAME_POOL : USERNAME_POOL, index);
    case 'MISC':
      return pickFromPool(da ? DA_MISC_POOL : MISC_POOL, index);
    case 'EMAIL': {
      const seed = context?.personSeed
        ? context.personSeed
        : pickFromPool(da ? DA_PERSON_POOL : PERSON_POOL, index);
      return buildEmail(seed, index);
    }
    case 'PHONE':
      return da ? daPhone(index) : pickFromPool(PHONE_POOL, index);
    case 'CREDIT_CARD':
      return pickFromPool(CREDIT_CARD_POOL, index);
    case 'SSN':
      return pickFromPool(SSN_POOL, index);
    case 'CPR':
      return da ? daCpr(index) : pickFromPool(CPR_POOL, index);
    case 'IBAN':
      return da ? daIban(index) : pickFromPool(IBAN_POOL, index);
    case 'IP_ADDRESS':
      return pickFromPool(IP_POOL, index);
    case 'BANK_ACCOUNT':
      return da ? daBankAccount(index) : pickFromPool(BANK_ACCOUNT_POOL, index);
    case 'PASSWORD':
    case 'URL':
    case 'DATE':
      // No safe synthetic — caller falls back to the typed placeholder.
      return null;
    default:
      return null;
  }
}

/**
 * Set of entity types that DO support synthetic substitution. Useful for
 * UI affordances ("Synthetic mode is unavailable for PASSWORD" etc.).
 */
export const SYNTHETIC_CAPABLE_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'PERSON',
  'LOCATION',
  'ORGANIZATION',
  'ADDRESS',
  'USERNAME',
  'MISC',
  'EMAIL',
  'PHONE',
  'CREDIT_CARD',
  'SSN',
  'CPR',
  'IBAN',
  'IP_ADDRESS',
  'BANK_ACCOUNT',
]);

/** True when the synthetic generator can produce a value for this type. */
export function supportsSynthetic(entityType: EntityType): boolean {
  return SYNTHETIC_CAPABLE_TYPES.has(entityType);
}

/**
 * Exposed for tests and UI previews. Returns the maximum number of
 * unique values the pool can produce before cycling with suffixes.
 */
export function poolSize(entityType: EntityType): number {
  switch (entityType) {
    case 'PERSON': return PERSON_POOL.length;
    case 'LOCATION': return LOCATION_POOL.length;
    case 'ORGANIZATION': return ORGANIZATION_POOL.length;
    case 'ADDRESS': return ADDRESS_POOL.length;
    case 'USERNAME': return USERNAME_POOL.length;
    case 'MISC': return MISC_POOL.length;
    case 'EMAIL': return PERSON_POOL.length * EMAIL_DOMAIN_POOL.length;
    case 'PHONE': return PHONE_POOL.length;
    case 'CREDIT_CARD': return CREDIT_CARD_POOL.length;
    case 'SSN': return SSN_POOL.length;
    case 'CPR': return CPR_POOL.length;
    case 'IBAN': return IBAN_POOL.length;
    case 'IP_ADDRESS': return IP_POOL.length;
    case 'BANK_ACCOUNT': return BANK_ACCOUNT_POOL.length;
    default: return 0;
  }
}
