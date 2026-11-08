import { DEFAULT_CURATED_URLS } from './constants';

/**
 * Sites the user added themselves ("Add a site").
 *
 * Two storage keys, because two parties write them: the extension pages write
 * the list (what the user asked for), the service worker writes the status
 * (what it managed to set up). Keeping them apart means neither overwrites the
 * other.
 */
export const USER_SITES_KEY = 'pg_user_sites';
export const USER_SITE_STATUS_KEY = 'pg_user_site_status';

/** A pending site that still has no permission after this long counts as refused. */
export const PENDING_GRACE_MS = 5 * 60 * 1000;

export interface UserSite {
  host: string;
  addedAt: number;
}

export type UserSiteState = 'pending' | 'active' | 'error';
export type UserSiteErrorReason = 'permission-denied' | 'register-failed';

export interface UserSiteStatus {
  state: UserSiteState;
  reason?: UserSiteErrorReason;
  /** Raw browser error text, for the debug view only. */
  detail?: string;
}

export type UserSiteStatusMap = Record<string, UserSiteStatus>;

export type ParseSiteFailure = 'empty' | 'invalid' | 'builtin' | 'too-broad' | 'shared-hosting' | 'duplicate';
export type ParseSiteResult =
  | { ok: true; host: string }
  | { ok: false; reason: ParseSiteFailure };

/** Second-level labels that make `co.uk`-style public suffixes. */
const SUFFIX_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

/**
 * Hosting suffixes where every customer gets a subdomain. Adding the suffix itself would put the extension
 * on thousands of unrelated sites, so only a site under it (`alice.github.io`) can be added.
 */
const SHARED_HOSTING_SUFFIXES = new Set([
  'github.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'herokuapp.com', 'blogspot.com',
  'web.app', 'firebaseapp.com', 'appspot.com', 'onrender.com', 'azurewebsites.net', 'glitch.me', 'wixsite.com',
]);

const LABEL =/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

function builtinHosts(): string[] {
  return DEFAULT_CURATED_URLS.map((url) => new URL(url).hostname);
}

export function isBuiltinHost(host: string): boolean {
  return builtinHosts().some((builtin) => host === builtin || host.endsWith(`.${builtin}`));
}

/**
 * Turn what the user typed (`chat.dk`, `https://www.chat.dk/login`) into the
 * bare host we protect. A leading `www.` and `*.` are dropped: the match
 * pattern already covers subdomains, and people who type `www.chat.dk` mean
 * the site, not only that one name. Only https sites are supported.
 */
export function parseSiteInput(raw: string, existing: readonly string[] = []): ParseSiteResult {
  let text = (raw ?? '').trim().toLowerCase();
  if (!text) return { ok: false, reason: 'empty' };
  if (/^http:\/\//.test(text)) return { ok: false, reason: 'invalid' };
  text = text.replace(/^https:\/\//, '').replace(/^\*\./, '');

  let host: string;
  try {
    const url = new URL(`https://${text}`);
    if (url.port || url.username || url.password) return { ok: false, reason: 'invalid' };
    host = url.hostname; // punycodes international names
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');

  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) {
    return { ok: false, reason: 'invalid' };
  }
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, reason: 'invalid' }; // IP address
  if (labels[labels.length - 1].length < 2) return { ok: false, reason: 'invalid' };
  // `co.uk` would hand the extension every site under it.
  if (labels.length === 2 && SUFFIX_LABELS.has(labels[0]) && labels[1].length === 2) {
    return { ok: false, reason: 'too-broad' };
  }
  if (SHARED_HOSTING_SUFFIXES.has(host)) return { ok: false, reason: 'shared-hosting' };
  if (isBuiltinHost(host)) return { ok: false, reason: 'builtin' };
  if (existing.includes(host)) return { ok: false, reason: 'duplicate' };
  return { ok: true, host };
}

/** Chrome match pattern for a host: `*.` also matches the bare host itself. */
export function originPattern(host: string): string {
  return `https://*.${host}/*`;
}

export function contentScriptId(host: string): string {
  return `pg-user-${host}`;
}

export function hostFromContentScriptId(id: string): string | null {
  const match = /^pg-user-(.+?)(?:-main)?$/.exec(id);
  return match ? match[1] : null;
}

export function urlMatchesHost(url: string | undefined, host: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * True when the page is one of the built-in sites. Compares the parsed host, not the start of the text:
 * `https://claude.ai.evil.example` and `https://claude.ai@evil.example` both begin with a built-in address.
 */
export function isCuratedUrl(url: string | undefined, curatedUrls: readonly string[] = DEFAULT_CURATED_URLS): boolean {
  if (!url) return false;
  try {
    const page = new URL(url);
    if (page.protocol !== 'https:' || page.port !== '') return false;
    return curatedUrls.some((curated) => {
      try {
        return page.hostname === new URL(curated).hostname;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function findUserSiteHost(url: string | undefined, hosts: readonly string[]): string | null {
  return hosts.find((host) => urlMatchesHost(url, host)) ?? null;
}

/**
 * What to show for a site. The worker records `active`/`error`; a site that is
 * still waiting for permission long after it was added is shown as refused,
 * because the popup that asked may have closed before it could say so.
 */
export function effectiveStatus(
  site: UserSite,
  status: UserSiteStatus | undefined,
  now: number = Date.now(),
): UserSiteStatus {
  if (status && status.state !== 'pending') return status;
  if (now - site.addedAt > PENDING_GRACE_MS) return { state: 'error', reason: 'permission-denied' };
  return { state: 'pending' };
}

// --- Storage (extension pages and service worker) ---

function normalizeSites(raw: unknown): UserSite[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const sites: UserSite[] = [];
  for (const entry of raw) {
    const host = typeof entry?.host === 'string' ? entry.host : '';
    if (!host || seen.has(host)) continue;
    seen.add(host);
    sites.push({ host, addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : 0 });
  }
  return sites;
}

export async function loadUserSites(): Promise<UserSite[]> {
  const result = await chrome.storage.local.get(USER_SITES_KEY);
  return normalizeSites(result[USER_SITES_KEY]);
}

export async function loadUserSiteHosts(): Promise<string[]> {
  return (await loadUserSites()).map((site) => site.host);
}

async function saveUserSites(sites: UserSite[]): Promise<void> {
  await chrome.storage.local.set({ [USER_SITES_KEY]: sites });
}

export async function loadUserSiteStatuses(): Promise<UserSiteStatusMap> {
  const result = await chrome.storage.local.get(USER_SITE_STATUS_KEY);
  const raw = result[USER_SITE_STATUS_KEY];
  return raw && typeof raw === 'object' ? (raw as UserSiteStatusMap) : {};
}

export async function saveUserSiteStatuses(statuses: UserSiteStatusMap): Promise<void> {
  await chrome.storage.local.set({ [USER_SITE_STATUS_KEY]: statuses });
}

/**
 * Add a site and ask Chrome for access to it. Must be called from a click
 * handler: the permission prompt needs a user gesture, so the request starts
 * before anything is awaited. If the page that asked closes while the prompt
 * is open (the toolbar popup does), the service worker finishes the job when
 * the permission arrives.
 */
export async function addUserSite(host: string): Promise<{ granted: boolean }> {
  const request = chrome.permissions.request({ origins: [originPattern(host)] });
  const sites = await loadUserSites();
  if (!sites.some((site) => site.host === host)) {
    await saveUserSites([...sites, { host, addedAt: Date.now() }]);
  }
  const statuses = await loadUserSiteStatuses();
  await saveUserSiteStatuses({ ...statuses, [host]: { state: 'pending' } });

  let granted = false;
  try {
    granted = await request;
  } catch {
    granted = false;
  }
  if (!granted) {
    const latest = await loadUserSiteStatuses();
    await saveUserSiteStatuses({ ...latest, [host]: { state: 'error', reason: 'permission-denied' } });
  }
  return { granted };
}

/** Remove a site; the service worker drops its scripts and revokes the permission. */
export async function removeUserSite(host: string): Promise<void> {
  const sites = await loadUserSites();
  await saveUserSites(sites.filter((site) => site.host !== host));
  const statuses = await loadUserSiteStatuses();
  delete statuses[host];
  await saveUserSiteStatuses(statuses);
}

export interface UserSitesSnapshot {
  sites: UserSite[];
  statuses: UserSiteStatusMap;
}

/** Call `onChange` now and whenever the list or status changes. Returns the unsubscribe. */
export function watchUserSites(onChange: (snapshot: UserSitesSnapshot) => void): () => void {
  const read = async (): Promise<void> => {
    onChange({ sites: await loadUserSites(), statuses: await loadUserSiteStatuses() });
  };
  const listener = (changes: Record<string, unknown>, area: string): void => {
    if (area === 'local' && (USER_SITES_KEY in changes || USER_SITE_STATUS_KEY in changes)) void read();
  };
  chrome.storage.onChanged.addListener(listener);
  void read();
  return () => chrome.storage.onChanged.removeListener(listener);
}
