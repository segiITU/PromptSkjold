/**
 * Whether the welcome guide has been shown. Only decides whether it opens by
 * itself after a fresh install; "Vis guide igen" in the options page opens it
 * regardless.
 */
export const ONBOARDING_KEY = 'pg_onboarding';
export const ONBOARDING_PAGE = 'onboarding/onboarding.html';

export interface OnboardingState {
  done: boolean;
  at?: number;
}

export async function loadOnboardingState(): Promise<OnboardingState> {
  const result = await chrome.storage.local.get(ONBOARDING_KEY);
  const raw = result[ONBOARDING_KEY];
  return { done: raw?.done === true, at: typeof raw?.at === 'number' ? raw.at : undefined };
}

export async function markOnboardingDone(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_KEY]: { done: true, at: Date.now() } satisfies OnboardingState });
}

/**
 * Open the guide in a new tab after a fresh install (never after an update),
 * unless it has been shown before.
 */
export async function openOnboardingOnInstall(reason: string | undefined): Promise<boolean> {
  if (reason !== 'install') return false;
  if ((await loadOnboardingState()).done) return false;
  await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PAGE) });
  return true;
}

export function openOnboarding(): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PAGE) });
}
