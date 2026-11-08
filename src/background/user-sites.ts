import {
  contentScriptId,
  hostFromContentScriptId,
  loadUserSiteStatuses,
  loadUserSites,
  originPattern,
  PENDING_GRACE_MS,
  saveUserSiteStatuses,
  type UserSiteStatus,
  type UserSiteStatusMap,
} from '../shared/user-sites';

const CONTENT_SCRIPT_FILE = 'content/content-script.js';
const PAGE_SCRIPT_FILE = 'content/clipboard-interceptor-page.js';

let running: Promise<void> = Promise.resolve();

/**
 * Bring the registered content scripts and the stored status in line with the
 * user's site list. Runs one at a time; call it whenever the list or the
 * granted permissions change.
 */
export function syncUserSites(): Promise<void> {
  running = running.then(runSync, runSync);
  return running;
}

function sameStatus(a: UserSiteStatus | undefined, b: UserSiteStatus): boolean {
  return a?.state === b.state && a?.reason === b.reason && a?.detail === b.detail;
}

async function registeredIds(): Promise<Set<string>> {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return new Set(scripts.map((script) => script.id).filter((id) => id.startsWith('pg-user-')));
}

async function register(host: string): Promise<void> {
  const matches = [originPattern(host)];
  const id = contentScriptId(host);
  await chrome.scripting.registerContentScripts([
    { id, matches, js: [CONTENT_SCRIPT_FILE], runAt: 'document_start', persistAcrossSessions: true },
    { id: `${id}-main`, matches, js: [PAGE_SCRIPT_FILE], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true },
  ]);
}

/** Registered scripts only apply to pages opened later; cover tabs already open. */
async function injectIntoOpenTabs(host: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: originPattern(host) });
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [PAGE_SCRIPT_FILE], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT_FILE] });
    } catch {
      // A tab that cannot be scripted (discarded, error page) is covered on its next load.
    }
  }
}

async function runSync(): Promise<void> {
  const sites = await loadUserSites();
  const previous = await loadUserSiteStatuses();
  const next: UserSiteStatusMap = {};
  const wanted = new Set(sites.map((site) => contentScriptId(site.host)));
  let registered = await registeredIds();

  // Sites the user removed: drop their scripts and give the permission back.
  for (const id of registered) {
    if (id.endsWith('-main') || wanted.has(id)) continue;
    const host = hostFromContentScriptId(id);
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [id, `${id}-main`] });
    } catch {
      // Already gone.
    }
    if (host) {
      try {
        await chrome.permissions.remove({ origins: [originPattern(host)] });
      } catch {
        // Best effort; a leftover permission does nothing without a script.
      }
    }
  }
  registered = await registeredIds();

  for (const site of sites) {
    const id = contentScriptId(site.host);
    let status: UserSiteStatus;
    try {
      const allowed = await chrome.permissions.contains({ origins: [originPattern(site.host)] });
      if (!allowed) {
        // The permission prompt may still be open. Only call it refused once it
        // has plainly been abandoned or the page that asked recorded a refusal.
        const waited = Date.now() - site.addedAt > PENDING_GRACE_MS;
        const refused = previous[site.host]?.state === 'error';
        status = waited || refused
          ? { state: 'error', reason: 'permission-denied' }
          : { state: 'pending' };
        if (registered.has(id)) {
          await chrome.scripting.unregisterContentScripts({ ids: [id, `${id}-main`] }).catch(() => undefined);
        }
      } else {
        const fresh = !registered.has(id) || !registered.has(`${id}-main`);
        if (fresh) {
          if (registered.has(id) || registered.has(`${id}-main`)) {
            await chrome.scripting.unregisterContentScripts({ ids: [id, `${id}-main`] }).catch(() => undefined);
          }
          await register(site.host);
        }
        // Trust the browser's own list, not the absence of an error.
        const confirmed = await registeredIds();
        if (!confirmed.has(id) || !confirmed.has(`${id}-main`)) {
          throw new Error('content scripts were not registered');
        }
        if (fresh) await injectIntoOpenTabs(site.host);
        status = { state: 'active' };
      }
    } catch (error) {
      status = {
        state: 'error',
        reason: 'register-failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    next[site.host] = status;
  }

  // A refusal recorded by the page while this ran is newer than what was computed.
  const latest = await loadUserSiteStatuses();
  for (const [host, status] of Object.entries(next)) {
    const seen = latest[host];
    if (status.state === 'pending' && seen?.state === 'error' && !sameStatus(previous[host], seen)) {
      next[host] = seen;
    }
  }

  const changed = Object.keys(next).length !== Object.keys(previous).length
    || Object.entries(next).some(([host, status]) => !sameStatus(previous[host], status));
  if (changed) await saveUserSiteStatuses(next);
}
