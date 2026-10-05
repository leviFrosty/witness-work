/**
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 * @bacons/apple-targets configuration for Siri and Shortcuts on the iPhone and
 * iPad: an App Intents extension, so the actions run without launching the
 * app. The intents are shared with the watch app (`ServiceIntents.swift`).
 * The bundle id suffix is listed in `AppGroup.swift`.
 */
module.exports = (config) => ({
  type: 'app-intent',
  name: 'intents',
  displayName: config.name,
  bundleIdentifier: '.intents',
  deploymentTarget: '17.0',
  frameworks: ['AppIntents', 'ActivityKit'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
})
