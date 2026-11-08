// The suite asserts English copy; production defaults to Danish (see src/shared/i18n/core.ts).
(globalThis as any).__PK_DEFAULT_LANGUAGE__ = 'en';

// Mock Chrome extension APIs for testing
(globalThis as any).chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    // Where conversation records go for a profile with cross-session memory
    // switched off. Present here because production code must degrade rather
    // than fail when it is missing — tests that need it to be absent delete it
    // explicitly.
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      setAccessLevel: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
    sendMessage: jest.fn().mockResolvedValue({}),
  },
  i18n: {
    getUILanguage: () => 'en',
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
};
