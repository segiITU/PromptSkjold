import { ONBOARDING_KEY, loadOnboardingState, markOnboardingDone, openOnboardingOnInstall } from '../../src/shared/onboarding-storage';
import { SUGGESTED_SITES, remainingSuggestions } from '../../src/shared/suggested-sites';
import { parseSiteInput } from '../../src/shared/user-sites';

describe('welcome guide opening', () => {
  let store: Record<string, unknown>;
  let create: jest.Mock;

  beforeEach(() => {
    store = {};
    create = jest.fn().mockResolvedValue({});
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn(async (key: string) => ({ [key]: store[key] })),
          set: jest.fn(async (value: Record<string, unknown>) => { store = { ...store, ...value }; }),
        },
      },
      tabs: { create },
      runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    };
  });

  test('opens the guide once after a fresh install', async () => {
    expect(await openOnboardingOnInstall('install')).toBe(true);
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://id/onboarding/onboarding.html' });
  });

  test.each(['update', 'chrome_update', 'shared_module_update', undefined])('does not open it on %s', async (reason) => {
    expect(await openOnboardingOnInstall(reason as string | undefined)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  test('does not open it again once it has been shown', async () => {
    await markOnboardingDone();
    expect((store[ONBOARDING_KEY] as { done: boolean }).done).toBe(true);
    expect(await loadOnboardingState()).toMatchObject({ done: true });
    expect(await openOnboardingOnInstall('install')).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('suggested sites', () => {
  test('every suggestion is a valid, not built-in site', () => {
    for (const site of SUGGESTED_SITES) {
      expect(parseSiteInput(site.host)).toEqual({ ok: true, host: site.host });
    }
  });

  test('a suggestion disappears once it is added', () => {
    const hosts = remainingSuggestions(['chat.dk', 'grok.com']).map((site) => site.host);
    expect(hosts).not.toContain('chat.dk');
    expect(hosts).not.toContain('grok.com');
    expect(hosts).toContain('perplexity.ai');
  });

  test('Copilot is built in, not suggested', () => {
    expect(SUGGESTED_SITES.some((site) => site.host.includes('copilot'))).toBe(false);
  });
});
