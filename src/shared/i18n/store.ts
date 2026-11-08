/**
 * Svelte store bridge for the i18n core (plain TS: this codebase uses Svelte
 * stores, see popup-model.svelte.ts, not module-level runes).
 *
 * In a component: `import { tr } from '.../i18n/store'` then `{$tr('ov.title')}`.
 * The store's value is a translate function that changes identity whenever the
 * language changes, so every `$tr(...)` in a template re-renders, including
 * when the language is changed in another tab.
 */
import { derived, writable, type Readable } from 'svelte/store';
import {
  getLanguage,
  getLanguagePreference,
  initLanguage,
  locale,
  onLanguageChange,
  setLanguagePreference,
  t,
  tn,
  type Language,
  type LanguagePreference,
  type MessageParams,
} from './core';
import type { MessageKey } from './da';

const version = writable(0);
const preference = writable<LanguagePreference>(getLanguagePreference());

onLanguageChange(() => {
  preference.set(getLanguagePreference());
  version.update((n) => n + 1);
});

export type Translate = (key: MessageKey, params?: MessageParams) => string;
export type TranslatePlural = (base: string, n: number, params?: MessageParams) => string;

/** `$tr('key', { name })` */
export const tr: Readable<Translate> = derived(version, (): Translate => (key, params) => t(key, params));
/** `$trn('ov.sub', count)` looks up `ov.sub.one` / `ov.sub.other`. */
export const trn: Readable<TranslatePlural> = derived(version, (): TranslatePlural => (base, n, params) => tn(base, n, params));
/** The resolved language ('da' | 'en'). */
export const language: Readable<Language> = derived(version, () => getLanguage());
/** The stored preference ('auto' | 'da' | 'en'). */
export const languagePreference: Readable<LanguagePreference> = { subscribe: preference.subscribe };
/** BCP-47 tag for Intl formatting. */
export const intlLocale: Readable<string> = derived(version, () => locale());

/** Call once at start-up of each surface that shows the language switch or must follow storage. */
export async function startI18n(): Promise<void> {
  await initLanguage();
  preference.set(getLanguagePreference());
  version.update((n) => n + 1);
}

export async function chooseLanguage(pref: LanguagePreference): Promise<void> {
  await setLanguagePreference(pref);
  preference.set(pref);
  version.update((n) => n + 1);
}
