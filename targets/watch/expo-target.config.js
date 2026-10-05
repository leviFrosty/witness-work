/**
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 * @bacons/apple-targets configuration for the Apple Watch app.
 *
 * A companion app (it needs the iPhone app): the iPhone stays the source of
 * truth and the watch talks to it over WatchConnectivity. The complications
 * live in `targets/watch-widgets`, embedded in this app. Bundle ids follow
 * Apple's `<host>.watchkitapp` convention; `AppGroup.swift` relies on them.
 */
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
  ],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
})
