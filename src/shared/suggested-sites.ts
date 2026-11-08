/**
 * Chat sites offered as one-click suggestions. They are not built in: a built-in
 * site is an install-time permission, so a site only becomes built in once it has
 * been tested (see TODO.md). Adding one uses the same flow as typing it in.
 */
export interface SuggestedSite {
  host: string;
  name: string;
  /** Short note shown under the name. */
  note: { da: string; en: string };
}

export const SUGGESTED_SITES: readonly SuggestedSite[] = [
  { host: 'perplexity.ai', name: 'Perplexity', note: { da: 'Søgning med AI', en: 'AI search' } },
  { host: 'chat.deepseek.com', name: 'DeepSeek', note: { da: 'Kinesisk AI-model', en: 'Chinese AI model' } },
  { host: 'chat.mistral.ai', name: 'Le Chat (Mistral)', note: { da: 'Europæisk AI', en: 'European AI' } },
  { host: 'grok.com', name: 'Grok', note: { da: 'xAI', en: 'xAI' } },
  { host: 'chat.dk', name: 'chat.dk', note: { da: 'Dansk AI-chat', en: 'Danish AI chat' } },
];

/** Suggestions that are not already added. */
export function remainingSuggestions(addedHosts: readonly string[]): SuggestedSite[] {
  return SUGGESTED_SITES.filter((site) => !addedHosts.includes(site.host));
}
