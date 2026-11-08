/** Wording for the image / scanned-document check switch. Danish is the default. */
export const IMAGE_CHECK_TEXT = {
  da: {
    title: "Tjek billeder og scannede filer",
    hintShort: 'Kører på denne computer',
    toggleHint: 'Læser tekst i billeder og scannede dokumenter, før de sendes',
    description:
      "Når den er slået til, læses dansk og engelsk tekst i billeder, scannede PDF'er og dokumenter, du vedhæfter, lokalt på denne computer, og du advares, før noget med personoplysninger sendes til en chat. Intet sendes nogen steder hen. Tekstgenkendelsen virker bedst på rene scanninger og skærmbilleder og overser nogle detaljer, så den er et sikkerhedsnet, ikke en garanti.",
  },
  en: {
    title: 'Check images and scanned files',
    hintShort: 'Runs on this computer',
    toggleHint: 'Reads text in images and scanned documents before they are sent',
    description:
      'When on, Danish and English text in images, scanned PDFs and documents you attach is read locally on this computer, and you are warned before anything with personal data goes to a chat. Nothing is sent anywhere. Text recognition works best on clean scans and screenshots and will miss some details, so it is a safety net, not a guarantee.',
  },
} as const;
