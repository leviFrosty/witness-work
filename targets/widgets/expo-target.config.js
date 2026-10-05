/**
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 * @bacons/apple-targets configuration for the WitnessWork widget extension.
 *
 * One iOS extension hosts a `WidgetBundle` of multiple widgets:
 *   - ReportWidget       (hours / checkbox)
 *   - ContactsWidget     (top contacts with quick actions)
 *   - AppointmentsWidget (upcoming follow-ups)
 *
 * `name` and `bundleIdentifier` are pinned to what has always shipped
 * (`widgets` / `<host>.widget`). Changing either orphans widgets users have
 * placed. The App Group comes from the host app's entitlements, so each variant
 * (dev `jwtimedev`, beta `jwtimebeta`, prod `jwtime`) points at its own
 * `group.<bundle id>`.
 */
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
