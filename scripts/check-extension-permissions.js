const fs = require('fs');
const path = require('path');

const SUPPORTED_HOST_PERMISSIONS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*',
  'https://copilot.com/*',
];

// `scripting` registers content scripts for sites the user adds; `activeTab` lets the
// toolbar popup read the address of the page it was opened on, so it can offer to add it.
const REQUIRED_PERMISSIONS = ['storage', 'offscreen', 'scripting', 'activeTab'];

// Optional: nothing is granted at install. Chrome asks the user for one site at a time
// ("Add a site"). Nothing else needs network access: the OCR language files ship in the package.
const OPTIONAL_HOST_PERMISSIONS = [
  'https://*/*',
];

function readManifest(rootDir = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
}

function sameStringSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function describeMismatch(label, actual, expected) {
  return `${label} must be exactly ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`;
}

function checkExtensionPermissions(manifest) {
  const errors = [];

  if (!sameStringSet(manifest.permissions, REQUIRED_PERMISSIONS)) {
    errors.push(describeMismatch('permissions', manifest.permissions, REQUIRED_PERMISSIONS));
  }

  // Host permissions already expose tab.url on the supported sites; `tabs`
  // would only add the "Read your browsing history" install warning.
  if (manifest.permissions?.includes('tabs')) {
    errors.push('tabs is not needed (host permissions cover tab URLs on supported sites) and must not be declared.');
  }

  if (!sameStringSet(manifest.host_permissions, SUPPORTED_HOST_PERMISSIONS)) {
    errors.push(describeMismatch('host_permissions', manifest.host_permissions, SUPPORTED_HOST_PERMISSIONS));
  }

  if (!sameStringSet(manifest.optional_host_permissions, OPTIONAL_HOST_PERMISSIONS)) {
    errors.push(describeMismatch('optional_host_permissions', manifest.optional_host_permissions, OPTIONAL_HOST_PERMISSIONS));
  }

  for (const [index, entry] of (manifest.content_scripts || []).entries()) {
    if (!sameStringSet(entry.matches, SUPPORTED_HOST_PERMISSIONS)) {
      errors.push(describeMismatch(`content_scripts[${index}].matches`, entry.matches, SUPPORTED_HOST_PERMISSIONS));
    }
  }

  // Only extension pages (offscreen document, popup, options) load packaged
  // assets, and they need no web-accessible entry. Exposing resources to the
  // chat sites would let those sites detect that the extension is installed.
  if (manifest.web_accessible_resources !== undefined) {
    errors.push('web_accessible_resources must not be declared; no page script needs packaged extension assets.');
  }

  return errors;
}

function main() {
  const errors = checkExtensionPermissions(readManifest());
  if (errors.length > 0) {
    console.error(['Chrome permission audit failed:', ...errors.map((error) => `- ${error}`)].join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log('Chrome permission audit passed.');
}

if (require.main === module) {
  main();
}

module.exports = {
  OPTIONAL_HOST_PERMISSIONS,
  REQUIRED_PERMISSIONS,
  SUPPORTED_HOST_PERMISSIONS,
  checkExtensionPermissions,
};
