/**
 * Visual categories used by the review overlay, popup and in-page pieces.
 *
 * The detector has 21 entity types; people read them as a handful of kinds.
 * Each category carries a colour, an underline style, a mark shape and an
 * icon (see styles in overlay-styles.css), so a finding never relies on
 * colour alone.
 */
import type { EntityType, GroupName } from '../message-types';
import ICONS from './icons.json';

export const CATEGORIES = [
  'name',
  'email',
  'phone',
  'cpr',
  'address',
  'bank',
  'secret',
  'org',
  'job',
  'ip',
  'date',
  'misc',
] as const;

export type Category = (typeof CATEGORIES)[number];

const ENTITY_CATEGORY: Record<EntityType, Category> = {
  PERSON: 'name',
  USERNAME: 'name',
  EMAIL: 'email',
  PHONE: 'phone',
  CPR: 'cpr',
  SSN: 'cpr',
  ID_DOCUMENT: 'cpr',
  BIRTH_DATE: 'date',
  ADDRESS: 'address',
  LOCATION: 'address',
  CREDIT_CARD: 'bank',
  IBAN: 'bank',
  BANK_ACCOUNT: 'bank',
  FINANCIAL_INFO: 'bank',
  PASSWORD: 'secret',
  ORGANIZATION: 'org',
  JOB_TITLE: 'job',
  IP_ADDRESS: 'ip',
  URL: 'ip',
  DATE: 'date',
  MISC: 'misc',
};

/** The category whose colour and icon stand for a whole detection group in the popup and options. */
export const GROUP_CATEGORY: Record<GroupName, Category> = {
  Identity: 'name',
  Contact: 'email',
  Financial: 'bank',
  Network: 'ip',
  Location: 'address',
  Password: 'secret',
  Organization: 'org',
  'Low-signal': 'misc',
};

export function categoryOf(type: EntityType | string): Category {
  return ENTITY_CATEGORY[type as EntityType] ?? 'misc';
}

/**
 * Icons: one hand-built set, 16px grid, 1.5px stroke, round caps and joins, no fills, one colour through
 * `currentColor`. The drawings live in icons.json (the only place to edit); `iconSvg` wraps them for HTML
 * strings (Shadow DOM pieces, `{@html}`), and EntityIcon.svelte wraps that for Svelte. Icons are decorative
 * (aria-hidden): the text label always stays next to them.
 */
const ICON_BODY = ICONS as Record<string, string>;

export type IconName = Exclude<keyof typeof ICONS, '$comment'>;

/** Full `<svg>` markup. Decorative: hidden from assistive tech. */
export function iconSvg(name: IconName | Category): string {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_BODY[name] ?? ICON_BODY.misc}</svg>`;
}
