/**
 * PromptSkjold i18n core (no framework dependency, usable from content
 * scripts, Shadow DOM pieces and Svelte alike).
 *
 * Danish is the default: until someone chooses otherwise the preference is
 * 'da', whatever the browser language is. 'auto' follows the browser (English
 * browsers get English, everything else Danish); 'en' forces English. The
 * choice is persisted in chrome.storage.local under its own key so it stays
 * out of the detection settings.
 */
import { da, type MessageKey } from './da';
import { en } from './en';

export type Language = 'da' | 'en';
export type LanguagePreference = 'auto' | Language;

export const LANGUAGE_STORAGE_KEY = 'pk_ui_language';

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { da, en };

// Production default is Danish. The unit-test setup sets this global to 'en' so the suite can keep asserting
// English copy even after jest.resetModules() re-evaluates this module.
const TEST_DEFAULT = (globalThis as { __PK_DEFAULT_LANGUAGE__?: LanguagePreference }).__PK_DEFAULT_LANGUAGE__;
let defaultPreference: LanguagePreference = TEST_DEFAULT ?? 'da';
let preference: LanguagePreference = defaultPreference;
let current: Language = resolve(preference);
const listeners = new Set<(lang: Language) => void>();
let storageWatching = false;

export function detectBrowserLanguage(): Language {
  let raw = '';
  try {
    raw = chrome?.i18n?.getUILanguage?.() ?? '';
  } catch {
    raw = '';
  }
  if (!raw && typeof navigator !== 'undefined') raw = navigator.language ?? '';
  return raw.toLowerCase().startsWith('en') ? 'en' : 'da';
}

function resolve(pref: LanguagePreference): Language {
  return pref === 'auto' ? detectBrowserLanguage() : pref;
}

function isPreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'da' || value === 'en';
}

function apply(pref: LanguagePreference): void {
  preference = pref;
  const next = resolve(pref);
  const changed = next !== current;
  current = next;
  if (changed) for (const l of listeners) l(current);
}

export function getLanguage(): Language {
  return current;
}

export function getLanguagePreference(): LanguagePreference {
  return preference;
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLanguageChange(listener: (lang: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read the stored preference and keep following changes made elsewhere (popup, options, other tabs). */
export async function initLanguage(): Promise<Language> {
  try {
    const result = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
    const stored = result?.[LANGUAGE_STORAGE_KEY];
    apply(isPreference(stored) ? stored : defaultPreference);
  } catch {
    apply(defaultPreference);
  }
  if (!storageWatching) {
    storageWatching = true;
    try {
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[LANGUAGE_STORAGE_KEY]) return;
        const next = changes[LANGUAGE_STORAGE_KEY].newValue;
        apply(isPreference(next) ? next : defaultPreference);
      });
    } catch {
      /* storage events are a convenience only */
    }
  }
  return current;
}

export async function setLanguagePreference(pref: LanguagePreference): Promise<void> {
  apply(pref);
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: pref });
}

export type MessageParams = Record<string, string | number>;

/** Translate a key. `{name}` placeholders are replaced from `params`. */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES.da[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Pluralised translate: looks up `${base}.one` for n === 1, else `${base}.other`.
 * `{n}` is filled in automatically.
 */
export function tn(base: string, n: number, params?: MessageParams): string {
  const key = `${base}.${n === 1 ? 'one' : 'other'}` as MessageKey;
  return t(key, { n, ...params });
}

/** Locale tag for Intl formatting. */
export function locale(): string {
  return current === 'da' ? 'da-DK' : 'en-GB';
}

/** Test helper: reset module state. */
export function __resetLanguageForTests(pref: LanguagePreference = defaultPreference): void {
  listeners.clear();
  storageWatching = false;
  preference = pref;
  current = resolve(pref);
}

/** Test helper: what a fresh install uses until a choice is stored (production: 'da'). */
export function __setDefaultPreferenceForTests(pref: LanguagePreference): void {
  defaultPreference = pref;
  __resetLanguageForTests(pref);
}
