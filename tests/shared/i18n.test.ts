import { da } from '../../src/shared/i18n/da';
import { en } from '../../src/shared/i18n/en';
import {
  __resetLanguageForTests,
  __setDefaultPreferenceForTests,
  detectBrowserLanguage,
  getLanguage,
  initLanguage,
  LANGUAGE_STORAGE_KEY,
  setLanguagePreference,
  t,
  tn,
} from '../../src/shared/i18n/core';

describe('i18n dictionaries', () => {
  it('Danish and English have identical keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(da).sort());
  });

  it('no value is empty', () => {
    for (const [k, v] of Object.entries(da)) expect([k, v.trim().length > 0]).toEqual([k, true]);
    for (const [k, v] of Object.entries(en)) expect([k, v.trim().length > 0]).toEqual([k, true]);
  });

  it('placeholders match between languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(da) as Array<keyof typeof da>) {
      expect([k, ph(en[k])]).toEqual([k, ph(da[k])]);
    }
  });

  it('every plural base has .one and .other', () => {
    const bases = new Set(Object.keys(da).filter((k) => /\.(one|other)$/.test(k)).map((k) => k.replace(/\.(one|other)$/, '')));
    for (const b of bases) {
      expect(Object.keys(da)).toContain(`${b}.one`);
      expect(Object.keys(da)).toContain(`${b}.other`);
    }
  });

  it('no user-visible string still says Privacy Guardrail or DFKI', () => {
    for (const v of [...Object.values(da), ...Object.values(en)]) {
      expect(v).not.toMatch(/Privacy Guardrail|DFKI/i);
    }
  });
});

describe('i18n core', () => {
  beforeEach(() => {
    __resetLanguageForTests('auto');
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockClear();
  });

  it('follows an English browser, falls back to Danish otherwise', () => {
    expect(detectBrowserLanguage()).toBe('en'); // test setup mocks chrome.i18n to en
    const orig = chrome.i18n.getUILanguage;
    (chrome.i18n as unknown as { getUILanguage: () => string }).getUILanguage = () => 'de-DE';
    expect(detectBrowserLanguage()).toBe('da');
    (chrome.i18n as unknown as { getUILanguage: () => string }).getUILanguage = () => 'da';
    expect(detectBrowserLanguage()).toBe('da');
    (chrome.i18n as unknown as { getUILanguage: () => string }).getUILanguage = orig;
  });

  it('manual choice wins, is stored, and is read back', async () => {
    await setLanguagePreference('da');
    expect(getLanguage()).toBe('da');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [LANGUAGE_STORAGE_KEY]: 'da' });
    expect(t('ov.title')).toBe(da['ov.title']);

    __resetLanguageForTests('auto');
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ [LANGUAGE_STORAGE_KEY]: 'da' });
    await initLanguage();
    expect(getLanguage()).toBe('da');
  });

  it('a fresh install is Danish whatever the browser language is', async () => {
    __setDefaultPreferenceForTests('da');
    try {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
      await initLanguage();
      expect(getLanguage()).toBe('da'); // the mocked browser language is English
      expect(detectBrowserLanguage()).toBe('en');
    } finally {
      __setDefaultPreferenceForTests('en');
    }
  });

  it('ignores a corrupt stored value', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({ [LANGUAGE_STORAGE_KEY]: 'klingon' });
    await initLanguage();
    expect(getLanguage()).toBe('en');
  });

  it('interpolates and pluralises', async () => {
    await setLanguagePreference('da');
    expect(tn('ov.sub', 1)).toBe(da['ov.sub.one']);
    expect(tn('ov.sub', 3)).toBe(da['ov.sub.other'].replace('{n}', '3'));
    await setLanguagePreference('en');
    expect(t('ov.summary', { r: 2, k: 1 })).toBe('2 will be replaced, 1 kept');
  });
});
