import {
  PENDING_GRACE_MS,
  effectiveStatus,
  findUserSiteHost,
  hostFromContentScriptId,
  contentScriptId,
  originPattern,
  parseSiteInput,
  isCuratedUrl,
  urlMatchesHost,
} from '../../src/shared/user-sites';
import { siteText } from '../../src/shared/user-sites-strings';

describe('isCuratedUrl', () => {
  const curated = ['https://claude.ai', 'https://chatgpt.com'];

  test.each([
    'https://claude.ai',
    'https://claude.ai/',
    'https://claude.ai/chat/abc?x=1#y',
    'https://CLAUDE.ai/new',
    'https://chatgpt.com/c/123',
  ])('%s is a built-in site', (url) => {
    expect(isCuratedUrl(url, curated)).toBe(true);
  });

  test.each([
    'https://claude.ai.evil.example/',
    'https://claude.aievil.com/',
    'https://claude.ai@evil.example/',
    'https://evil.example/?next=https://claude.ai',
    'https://evil.example/https://claude.ai',
    'https://sub.claude.ai/',
    'https://claude.ai:8443/',
    'http://claude.ai/',
    'claude.ai',
    '',
  ])('%s is not', (url) => {
    expect(isCuratedUrl(url, curated)).toBe(false);
  });

  test('a missing address, or a list with junk in it, never matches by accident', () => {
    expect(isCuratedUrl(undefined, curated)).toBe(false);
    expect(isCuratedUrl('https://claude.ai/', ['not a url', ''])).toBe(false);
  });
});

describe('parseSiteInput', () => {
  test.each([
    ['chat.dk', 'chat.dk'],
    ['  Chat.DK  ', 'chat.dk'],
    ['https://chat.dk/login?x=1', 'chat.dk'],
    ['https://www.chat.dk', 'chat.dk'],
    ['*.chat.dk', 'chat.dk'],
    ['app.chat.dk', 'app.chat.dk'],
    ['bøger.dk', 'xn--bger-gra.dk'],
    // One app on a shared host is one site; only the shared suffix itself is too broad.
    ['mychat.vercel.app', 'mychat.vercel.app'],
    ['https://alice.github.io/chat', 'alice.github.io'],
  ])('accepts %s', (raw, host) => {
    expect(parseSiteInput(raw)).toEqual({ ok: true, host });
  });

  test.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['dk', 'invalid'],
    ['localhost', 'invalid'],
    ['192.168.0.1', 'invalid'],
    ['http://chat.dk', 'invalid'],
    ['chat.dk:8080', 'invalid'],
    ['user@chat.dk', 'invalid'],
    ['chat dk', 'invalid'],
    ['co.uk', 'too-broad'],
    ['com.au', 'too-broad'],
    ['github.io', 'shared-hosting'],
    ['https://www.github.io/', 'shared-hosting'],
    ['*.pages.dev', 'shared-hosting'],
    ['vercel.app', 'shared-hosting'],
    ['BLOGSPOT.com', 'shared-hosting'],
    ['herokuapp.com', 'shared-hosting'],
    ['netlify.app', 'shared-hosting'],
    ['claude.ai', 'builtin'],
    ['https://chatgpt.com/c/1', 'builtin'],
    ['gemini.google.com', 'builtin'],
    ['copilot.microsoft.com', 'builtin'],
    ['https://copilot.com/chats', 'builtin'],
  ])('rejects %s as %s', (raw, reason) => {
    expect(parseSiteInput(raw)).toEqual({ ok: false, reason });
  });

  test('rejects a site that is already on the list', () => {
    expect(parseSiteInput('www.chat.dk', ['chat.dk'])).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('the message for a shared hosting suffix', () => {
  test('exists in Danish and English and names the problem and what to do', () => {
    expect(siteText('da').parse['shared-hosting']).toMatch(/deler|mange/i);
    expect(siteText('en').parse['shared-hosting']).toMatch(/shared|many/i);
    expect(siteText('en').parse['shared-hosting']).toMatch(/github\.io/);
  });
});

describe('matching', () => {
  test('origin pattern covers the site and its subdomains', () => {
    expect(originPattern('chat.dk')).toBe('https://*.chat.dk/*');
  });

  test('urlMatchesHost matches the host and subdomains over https only', () => {
    expect(urlMatchesHost('https://chat.dk/a', 'chat.dk')).toBe(true);
    expect(urlMatchesHost('https://app.chat.dk/a', 'chat.dk')).toBe(true);
    expect(urlMatchesHost('https://notchat.dk/a', 'chat.dk')).toBe(false);
    expect(urlMatchesHost('https://chat.dk.evil.com/', 'chat.dk')).toBe(false);
    expect(urlMatchesHost('http://chat.dk/', 'chat.dk')).toBe(false);
    expect(urlMatchesHost(undefined, 'chat.dk')).toBe(false);
    expect(urlMatchesHost('not a url', 'chat.dk')).toBe(false);
  });

  test('findUserSiteHost returns the matching host', () => {
    expect(findUserSiteHost('https://x.chat.dk/', ['a.com', 'chat.dk'])).toBe('chat.dk');
    expect(findUserSiteHost('https://other.dk/', ['chat.dk'])).toBeNull();
  });

  test('content script ids round-trip to the host', () => {
    expect(hostFromContentScriptId(contentScriptId('chat.dk'))).toBe('chat.dk');
    expect(hostFromContentScriptId(`${contentScriptId('chat.dk')}-main`)).toBe('chat.dk');
  });
});

describe('effectiveStatus', () => {
  const site = { host: 'chat.dk', addedAt: 1_000 };

  test('a recorded outcome wins', () => {
    expect(effectiveStatus(site, { state: 'active' }, 2_000)).toEqual({ state: 'active' });
    expect(effectiveStatus(site, { state: 'error', reason: 'register-failed' }, 2_000).state).toBe('error');
  });

  test('pending stays pending while the prompt may still be open', () => {
    expect(effectiveStatus(site, { state: 'pending' }, 2_000)).toEqual({ state: 'pending' });
    expect(effectiveStatus(site, undefined, 2_000)).toEqual({ state: 'pending' });
  });

  test('pending for too long is shown as refused', () => {
    expect(effectiveStatus(site, { state: 'pending' }, 1_000 + PENDING_GRACE_MS + 1)).toEqual({
      state: 'error',
      reason: 'permission-denied',
    });
  });
});
