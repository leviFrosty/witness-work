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
