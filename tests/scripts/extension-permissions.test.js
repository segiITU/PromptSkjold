const {
  OPTIONAL_HOST_PERMISSIONS,
  REQUIRED_PERMISSIONS,
  SUPPORTED_HOST_PERMISSIONS,
  checkExtensionPermissions,
} = require('../../scripts/check-extension-permissions');

function validManifest(overrides = {}) {
  return {
    permissions: [...REQUIRED_PERMISSIONS],
    host_permissions: [...SUPPORTED_HOST_PERMISSIONS],
    optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],
    content_scripts: [
      { matches: [...SUPPORTED_HOST_PERMISSIONS], js: ['content/content-script.js'] },
      { matches: [...SUPPORTED_HOST_PERMISSIONS], js: ['content/clipboard-interceptor-page.js'] },
    ],
    ...overrides,
  };
}

describe('extension permission audit', () => {
  test('accepts the public beta manifest permission surface', () => {
    expect(checkExtensionPermissions(validManifest())).toEqual([]);
  });

  test('rejects tabs and unsupported host permissions', () => {
    const errors = checkExtensionPermissions(
      validManifest({
        permissions: [...REQUIRED_PERMISSIONS, 'tabs'],
        host_permissions: [...SUPPORTED_HOST_PERMISSIONS, 'https://example.com/*'],
      })
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('permissions must be exactly'),
        expect.stringContaining('tabs is not needed'),
        expect.stringContaining('host_permissions must be exactly'),
      ])
    );
  });

  test('rejects a broader optional host permission than the audited set', () => {
    const errors = checkExtensionPermissions(
      validManifest({ optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS, '<all_urls>'] })
    );

    expect(errors).toEqual([expect.stringContaining('optional_host_permissions must be exactly')]);
  });

  test('rejects unsupported content script matches', () => {
    const errors = checkExtensionPermissions(
      validManifest({
        content_scripts: [{ matches: ['<all_urls>'], js: ['content/content-script.js'] }],
      })
    );

    expect(errors).toEqual([expect.stringContaining('content_scripts[0].matches must be exactly')]);
  });

  test('rejects any web-accessible resources, even scoped to supported hosts', () => {
    const errors = checkExtensionPermissions(
      validManifest({
        web_accessible_resources: [{ resources: ['wasm/*.wasm'], matches: [...SUPPORTED_HOST_PERMISSIONS] }],
      })
    );

    expect(errors).toEqual([expect.stringContaining('web_accessible_resources must not be declared')]);
  });
});
