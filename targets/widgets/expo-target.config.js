module.exports = (config) => ({
  type: 'widget',
  name: 'widgets',
  bundleIdentifier: '.widget',
  icon:
    process.env.APP_VARIANT === 'beta'
      ? '../../src/assets/icon-beta.png'
      : '../../src/assets/icon.png',
  deploymentTarget: '17.0',
  colors: {
    $accent: '#4BD27C',
    $widgetBackground: '#FFFFFF',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
})
