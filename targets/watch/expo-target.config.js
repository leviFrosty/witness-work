module.exports = (config) => ({
  type: 'watch',
  name: 'watch',
  displayName: config.name,
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '26.0',
  icon:
    process.env.APP_VARIANT === 'beta'
      ? '../../src/assets/icon-beta.png'
      : '../../src/assets/icon.png',
  colors: {
    $accent: '#4BD27C',
  },
  frameworks: [
    'SwiftUI',
    'WatchKit',
    'WatchConnectivity',
    'WidgetKit',
    'AppIntents',
    'MapKit',
  ],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
})
