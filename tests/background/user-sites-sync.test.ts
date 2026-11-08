import { USER_SITES_KEY, USER_SITE_STATUS_KEY, type UserSiteStatusMap } from '../../src/shared/user-sites';

describe('syncUserSites', () => {
  let store: Record<string, unknown>;
  let registered: Array<{ id: string; matches: string[] }>;
  let granted: Set<string>;
  let registerContentScripts: jest.Mock;
  let unregisterContentScripts: jest.Mock;
  let executeScript: jest.Mock;
  let removePermission: jest.Mock;
  let queryTabs: jest.Mock;
  let sync: () => Promise<void>;

  beforeEach(async () => {
    jest.resetModules();
    store = {};
    registered = [];
    granted = new Set();
    registerContentScripts = jest.fn(async (scripts: Array<{ id: string; matches: string[] }>) => {
      registered.push(...scripts.map(({ id, matches }) => ({ id, matches })));
    });
    unregisterContentScripts = jest.fn(async ({ ids }: { ids: string[] }) => {
      registered = registered.filter((script) => !ids.includes(script.id));
    });
    executeScript = jest.fn().mockResolvedValue([]);
    removePermission = jest.fn().mockResolvedValue(true);
    queryTabs = jest.fn().mockResolvedValue([{ id: 7 }]);

    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn(async (key: string) => ({ [key]: store[key] })),
          set: jest.fn(async (value: Record<string, unknown>) => { store = { ...store, ...value }; }),
        },
      },
      permissions: {
        contains: jest.fn(async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin))),
        remove: removePermission,
      },
      scripting: {
        getRegisteredContentScripts: jest.fn(async () => registered),
        registerContentScripts,
        unregisterContentScripts,
        executeScript,
      },
      tabs: { query: queryTabs },
    };
    sync = (await import('../../src/background/user-sites')).syncUserSites;
  });

  const status = (): UserSiteStatusMap => store[USER_SITE_STATUS_KEY] as UserSiteStatusMap;
  const addSite = (host: string, addedAt = Date.now()) => {
    store[USER_SITES_KEY] = [...((store[USER_SITES_KEY] as unknown[]) ?? []), { host, addedAt }];
  };

  test('registers both scripts and marks the site active once permission is granted', async () => {
    addSite('chat.dk');
    granted.add('https://*.chat.dk/*');
    await sync();

    expect(registered.map((script) => script.id).sort()).toEqual(['pg-user-chat.dk', 'pg-user-chat.dk-main']);
    expect(registered[0].matches).toEqual(['https://*.chat.dk/*']);
    expect(status()['chat.dk']).toEqual({ state: 'active' });
  });

  test('covers a tab that was already open', async () => {
    addSite('chat.dk');
    granted.add('https://*.chat.dk/*');
    await sync();

    expect(queryTabs).toHaveBeenCalledWith({ url: 'https://*.chat.dk/*' });
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ world: 'MAIN', target: { tabId: 7 } }));
  });

  test('does not register again or reinject on a second sync', async () => {
    addSite('chat.dk');
    granted.add('https://*.chat.dk/*');
    await sync();
    await sync();

    expect(registerContentScripts).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  test('keeps a fresh site pending while the permission prompt may be open', async () => {
    addSite('chat.dk');
    await sync();

    expect(registered).toEqual([]);
    expect(status()['chat.dk']).toEqual({ state: 'pending' });
  });

  test('reports a refusal as permission-denied after the wait is over', async () => {
    addSite('chat.dk', Date.now() - 10 * 60 * 1000);
    await sync();

    expect(status()['chat.dk']).toEqual({ state: 'error', reason: 'permission-denied' });
  });

  test('keeps a refusal the page recorded', async () => {
    addSite('chat.dk');
    store[USER_SITE_STATUS_KEY] = { 'chat.dk': { state: 'error', reason: 'permission-denied' } };
    await sync();

    expect(status()['chat.dk']).toEqual({ state: 'error', reason: 'permission-denied' });
  });

  test('reports register-failed when the browser rejects the scripts', async () => {
    addSite('chat.dk');
    granted.add('https://*.chat.dk/*');
    registerContentScripts.mockRejectedValueOnce(new Error('Cannot access contents of url'));
    await sync();

    expect(status()['chat.dk']).toEqual({
      state: 'error',
      reason: 'register-failed',
      detail: 'Cannot access contents of url',
    });
  });

  test('a site that fails does not stop the others', async () => {
    addSite('bad.dk');
    addSite('chat.dk');
    granted.add('https://*.bad.dk/*');
    granted.add('https://*.chat.dk/*');
    registerContentScripts.mockRejectedValueOnce(new Error('nope'));
    await sync();

    expect(status()['bad.dk'].state).toBe('error');
    expect(status()['chat.dk']).toEqual({ state: 'active' });
  });

  test('removing a site unregisters its scripts and gives the permission back', async () => {
    addSite('chat.dk');
    granted.add('https://*.chat.dk/*');
    await sync();

    store[USER_SITES_KEY] = [];
    await sync();

    expect(registered).toEqual([]);
    expect(removePermission).toHaveBeenCalledWith({ origins: ['https://*.chat.dk/*'] });
    expect(status()).toEqual({});
  });

  test('revoked permission turns an active site into a refusal and removes its scripts', async () => {
    addSite('chat.dk', Date.now() - 10 * 60 * 1000);
    granted.add('https://*.chat.dk/*');
    await sync();
    granted.clear();
    await sync();

    expect(registered).toEqual([]);
    expect(status()['chat.dk']).toEqual({ state: 'error', reason: 'permission-denied' });
  });
});
