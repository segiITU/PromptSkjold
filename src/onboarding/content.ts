import type { GroupName } from '../shared/message-types';

/**
 * Everything the welcome guide says, as plain data, so the wording can change
 * and the page can be restyled without touching the logic.
 */
export type Lang = 'da' | 'en';
export type Text = Record<Lang, string>;

export const SLIDE_IDS = ['how', 'sites', 'setup', 'about'] as const;
export type SlideId = (typeof SLIDE_IDS)[number];

export const SLIDES: Record<SlideId, { title: Text; body: Text }> = {
  how: {
    title: { da: 'Sådan beskytter PromptSkjold dig', en: 'How PromptSkjold protects you' },
    body: {
      da: "Før noget, du skriver, indsætter eller vedhæfter, sendes til en AI-chat, tjekker PromptSkjold det på din egen computer. Det gælder også billeder, scannede PDF'er og Word-filer: teksten i dem læses lokalt (OCR) og tjekkes på samme måde. Excel- og PowerPoint-filer tjekkes kun, hvis du selv slår det til. Finder det personoplysninger, som CPR-numre, navne eller kontonumre, kan du erstatte dem og sende videre. Intet forlader din computer, og der er ingen konto.",
      en: 'Before anything you type, paste or attach is sent to an AI chat, PromptSkjold checks it on your own computer. That includes images, scanned PDFs and Word files: the text in them is read locally (OCR) and checked the same way. Excel and PowerPoint files are only checked if you turn that on. If it finds personal data, such as CPR numbers, names or account numbers, you can replace it and send on. Nothing leaves your computer, and there is no account.',
    },
  },
  sites: {
    title: { da: 'Vælg dine sider', en: 'Choose your sites' },
    body: {
      da: 'ChatGPT, Claude, Gemini og Copilot er beskyttet fra start. Bruger du en anden chat, kan du tilføje den her eller senere: skriv adressen, og tillad adgang til netop den side, når browseren spørger.',
      en: 'ChatGPT, Claude, Gemini and Copilot are protected from the start. If you use another chat, add it here or later: type the address and allow access to just that site when the browser asks.',
    },
  },
  setup: {
    title: { da: 'Tilpas', en: 'Set up' },
    body: {
      da: 'Standardindstillingerne passer til de fleste. Du kan ændre dem når som helst i indstillingerne.',
      en: 'The defaults suit most people. You can change them any time in the settings.',
    },
  },
  about: {
    title: { da: 'Åben kildekode', en: 'Open source' },
    body: {
      da: 'PromptSkjold er open source (Apache-2.0), så alle kan læse, hvad den gør. Oplever du en fejl, eller overser den noget, så indmeld fejl på GitHub; brug gerne opdigtede eksempler i stedet for rigtige personoplysninger. Har du lyst til at hjælpe, er du meget velkommen til at bidrage.',
      en: 'PromptSkjold is open source (Apache-2.0), so anyone can read what it does. If you hit a bug or it misses something, report it on GitHub, using made-up examples rather than real personal data. If you would like to help, contributions are very welcome.',
    },
  },
};

/** The limits notice shown on the first slide. */
export const LIMITS: Text = {
  da: 'PromptSkjold er et hjælpeværktøj, ikke en garanti. Den kan overse personoplysninger eller markere noget forkert, og den erstatter hverken dit eget overblik eller en manuel gennemgang, før du sender.',
  en: 'PromptSkjold is an aid, not a guarantee. It can miss personal data or flag the wrong thing, and it does not replace your own judgement or a manual review before you send.',
};

export const UI: Record<string, Text> = {
  next: { da: 'Næste', en: 'Next' },
  back: { da: 'Tilbage', en: 'Back' },
  done: { da: 'Færdig', en: 'Done' },
  language: { da: 'English', en: 'Dansk' },
  builtIn: { da: 'Beskyttet fra start', en: 'Protected from the start' },
  imageCheck: { da: 'Tjek billeder og scannede filer', en: 'Check images and scanned files' },
  imageCheckHint: { da: 'Læser tekst i billeder og scannede dokumenter, før de sendes', en: 'Reads text in images and scanned documents before they are sent' },
  officeCheck: { da: 'Tjek Excel- og PowerPoint-filer', en: 'Check Excel and PowerPoint files' },
  officeCheckHint: { da: 'Slået fra som standard: store filer kan være langsomme at tjekke.', en: 'Off by default: large files can be slow to check.' },
  flagTitle: { da: 'Hvad skal markeres?', en: 'What should be flagged?' },
  replaceLanguage: { da: 'Sprog for erstatninger', en: 'Language of replacements' },
  replaceAuto: { da: 'Følg teksten', en: 'Match the text' },
  replaceDa: { da: 'Dansk', en: 'Danish' },
  replaceEn: { da: 'Engelsk', en: 'English' },
  pinTitle: { da: 'Tip: fastgør PromptSkjold', en: 'Tip: pin PromptSkjold' },
  pinBody: {
    da: 'Klik på puslespils-ikonet i browserens værktøjslinje og vælg nåle-ikonet ved PromptSkjold, så den altid er lige ved hånden.',
    en: "Click the puzzle-piece icon in the browser's toolbar and choose the pin next to PromptSkjold so it is always at hand.",
  },
  demoFound: { da: '4 følsomme oplysninger fundet', en: '4 sensitive items found' },
  demoButton: { da: 'Erstat og indsæt', en: 'Replace & paste' },
  demoReplaced: { da: '4 oplysninger erstattet', en: '4 items replaced' },
  demoLabel: { da: 'Eksempel på en besked, før og efter', en: 'Example message, before and after' },
  termsLabel: {
    da: 'Jeg har forstået, at PromptSkjold bruges på eget ansvar, og accepterer vilkårene.',
    en: 'I understand that PromptSkjold is used at my own risk, and I accept the terms.',
  },
  termsLink: { da: 'Læs vilkårene', en: 'Read the terms' },
  reportBug: { da: 'Indmeld fejl', en: 'Report a bug' },
  contribute: { da: 'Bidrag', en: 'Contribute' },
  viewCode: { da: 'Se koden', en: 'View the code' },
  ctaTitle: { da: 'Lavet af ermias.ai', en: 'Made by ermias.ai' },
  ctaBody: { da: 'Vil du høre mere om vores arbejde med AI og privatliv?', en: 'Want to hear more about our work on AI and privacy?' },
  ctaButton: { da: 'Besøg ermias.ai', en: 'Visit ermias.ai' },
  demoAddButton: { da: 'Tilføj', en: 'Add' },
  demoActive: { da: 'PromptSkjold er aktiv på siden', en: 'PromptSkjold is active on this site' },
};

/**
 * The demo sentence, split so the same text can be shown plain, with the found
 * items marked, and with them replaced. `ph` is the placeholder the item gets.
 */
export type DemoPart = { t: string; ph?: string };
export const DEMO: Record<Lang, DemoPart[]> = {
  da: [
    { t: 'Hej, jeg hedder ' }, { t: 'Sebastian Gilson', ph: '[PERSON_1]' },
    { t: ' og jeg er AI-udvikler hos ' }, { t: 'ermias.ai', ph: '[ORG_1]' },
    { t: '. Mit cpr-nr er ' }, { t: '121212-1212', ph: '[CPR_1]' },
    { t: ' og jeg tjener omkring ' }, { t: '100 kr', ph: '[INDKOMST_1]' },
    { t: ' om måneden - af disse afbetaler jeg 20kr. om måneden til lakridser.' },
  ],
  en: [
    { t: 'Hi, my name is ' }, { t: 'Sebastian Gilson', ph: '[PERSON_1]' },
    { t: ' and I am an AI developer at ' }, { t: 'ermias.ai', ph: '[ORG_1]' },
    { t: '. My CPR number is ' }, { t: '121212-1212', ph: '[CPR_1]' },
    { t: ' and I earn about ' }, { t: '100 kr', ph: '[INCOME_1]' },
    { t: ' a month - of this I pay 20 kr. a month for liquorice.' },
  ],
};

export const EXTERNAL_LINKS = {
  repo: 'https://github.com/segiITU/PromptSkjold',
  issues: 'https://github.com/segiITU/PromptSkjold/issues/new/choose',
  contributing: 'https://github.com/segiITU/PromptSkjold/blob/main/CONTRIBUTING.md',
  ermias: 'https://ermias.ai',
} as const;

/** The categories offered on the last slide, with what each covers. */
export const FLAG_GROUPS: Array<{ id: GroupName; label: Text; covers: Text }> = [
  { id: 'Identity', label: { da: 'Navne og identitet', en: 'Names and identity' }, covers: { da: 'navne, brugernavne, ID-dokumenter, fødselsdato, stilling', en: 'names, usernames, ID documents, birth date, job title' } },
  { id: 'Contact', label: { da: 'Kontaktoplysninger', en: 'Contact details' }, covers: { da: 'e-mail, telefon, adresse', en: 'email, phone, address' } },
  { id: 'Financial', label: { da: 'Økonomi og CPR', en: 'Money and CPR' }, covers: { da: 'kort, IBAN, kontonumre, CPR, løn', en: 'cards, IBAN, account numbers, CPR, salary' } },
  { id: 'Location', label: { da: 'Steder', en: 'Places' }, covers: { da: 'byer og lande', en: 'towns and countries' } },
  { id: 'Organization', label: { da: 'Organisationer', en: 'Organisations' }, covers: { da: 'virksomheder og arbejdspladser', en: 'companies and workplaces' } },
  { id: 'Password', label: { da: 'Adgangskoder og nøgler', en: 'Passwords and keys' }, covers: { da: 'adgangskoder, API-nøgler, tokens', en: 'passwords, API keys, tokens' } },
  { id: 'Network', label: { da: 'Netværk', en: 'Network' }, covers: { da: 'IP-adresser', en: 'IP addresses' } },
];
