module.exports = (config) => ({
  type: 'notification-service',
  name: 'notifications',
  bundleIdentifier: '.notifications',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],

    'keychain-access-groups': [
      config.ios.entitlements['keychain-access-groups'][1],
    ],
  },
})
