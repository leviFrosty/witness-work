module.exports = (config) => ({
  type: 'watch-widget',
  name: 'watchwidgets',
  displayName: config.name,
  bundleIdentifier: '.watchkitapp.widgets',
  deploymentTarget: '26.0',
  colors: {
    $accent: '#4BD27C',
    $widgetBackground: '#000000',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
})
