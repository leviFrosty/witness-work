/**
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 * @bacons/apple-targets configuration for the Notification Service Extension
 * that names Buddies alerts ("Anna invited you to a Plan"). The relay only
 * knows a generic template; the extension opens the sealed event the push
 * carries with keys the app shares through a Keychain access group, and words
 * the alert with strings generated from `src/locales`
 * (`scripts/sync-widget-shared.mjs`). See `NotificationService.swift`.
 */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'notifications',
  bundleIdentifier: '.notifications',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
    // The second of the app's groups (app.config.ts): only the alert snapshot.
    'keychain-access-groups': [
      config.ios.entitlements['keychain-access-groups'][1],
    ],
  },
})
