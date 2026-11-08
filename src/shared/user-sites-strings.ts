import type { ParseSiteFailure, UserSiteErrorReason } from './user-sites';

/**
 * Wording for the "Add a site" surfaces. Danish is the default, matching the
 * product's Danish-first design.
 */
export type SiteLang = 'da' | 'en';

export const SITE_TEXT = {
  da: {
    title: 'Dine egne sider',
    hint: 'Tilføj en chatbot-side, så PromptSkjold tjekker det, du skriver, indsætter og vedhæfter, før det sendes. ChatGPT, Claude og Gemini er testet; andre sider bruger en generel tilpasning og kan fungere dårligere.',
    placeholder: 'fx chat.dk',
    add: 'Tilføj',
    remove: 'Fjern',
    retry: 'Prøv igen',
    builtin: 'Indbygget',
    pending: 'Sætter beskyttelse op…',
    active: 'PromptSkjold er aktiv på siden',
    emptyList: 'Du har ikke tilføjet egne sider endnu.',
    suggestedTitle: 'Foreslåede sider',
    unsupportedBanner: 'Siden er ikke sikret af PromptSkjold.',
    addThisPage: 'Tilføj denne side',
    unsupportedPage: 'Denne side kan ikke sikres af PromptSkjold.',
    errors: {
      'permission-denied': 'Siden kan ikke tilgås af PromptSkjold – der foretages ikke tjek. Du skal give tilladelse til siden.',
      'register-failed': 'Siden kan ikke tilgås af PromptSkjold – der foretages ikke tjek. Browseren afviste opsætningen.',
    } satisfies Record<UserSiteErrorReason, string>,
    parse: {
      empty: 'Skriv adressen på siden.',
      invalid: 'Det ligner ikke en gyldig https-adresse.',
      builtin: 'Den side er allerede beskyttet.',
      'too-broad': 'Adressen er for bred. Skriv selve sidens adresse.',
      'shared-hosting': 'Adressen deles af mange forskellige sider (fx github.io). Skriv sidens fulde adresse, fx min-side.github.io.',
      duplicate: 'Siden er allerede på listen.',
    } satisfies Record<ParseSiteFailure, string>,
  },
  en: {
    title: 'Your own sites',
    hint: 'Add a chatbot site so PromptSkjold checks what you type, paste and attach before it is sent. ChatGPT, Claude and Gemini are tested; other sites use a generic adaptation and may work less well.',
    placeholder: 'e.g. chat.dk',
    add: 'Add',
    remove: 'Remove',
    retry: 'Try again',
    builtin: 'Built in',
    pending: 'Setting up protection…',
    active: 'PromptSkjold is active on this site',
    emptyList: 'You have not added any sites yet.',
    suggestedTitle: 'Suggested sites',
    unsupportedBanner: 'This site is not protected by PromptSkjold.',
    addThisPage: 'Add this site',
    unsupportedPage: 'PromptSkjold cannot protect this page.',
    errors: {
      'permission-denied': 'PromptSkjold cannot access this site, so nothing is checked. You need to allow access to the site.',
      'register-failed': 'PromptSkjold cannot access this site, so nothing is checked. The browser rejected the setup.',
    } satisfies Record<UserSiteErrorReason, string>,
    parse: {
      empty: 'Enter the address of the site.',
      invalid: 'That does not look like a valid https address.',
      builtin: 'That site is already protected.',
      'too-broad': 'That address is too broad. Enter the site itself.',
      'shared-hosting': 'That address is shared by many different sites (e.g. github.io). Enter the full address of the site, e.g. my-site.github.io.',
      duplicate: 'That site is already on the list.',
    } satisfies Record<ParseSiteFailure, string>,
  },
} as const;

export function siteText(lang: SiteLang = 'da') {
  return SITE_TEXT[lang];
}
