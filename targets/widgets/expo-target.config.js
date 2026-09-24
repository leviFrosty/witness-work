/**
 * @bacons/apple-targets configuration for the WitnessWork widget extension.
 *
 * One iOS extension hosts a `WidgetBundle` of multiple widgets:
 *   - ReportWidget       (hours / checkbox)
 *   - ContactsWidget     (top contacts with quick actions)
 *   - AppointmentsWidget (upcoming follow-ups)
 *
 * The App Group identifier is mirrored from the host app's bundle id so each
 * variant (dev `jwtimedev`, beta `jwtimebeta`, prod `jwtime`) points at its
 * own `group.<bundle id>` automatically. Keep in sync with `app.config.ts`.
 */
const BUNDLE_ID =
  {
    development: 'com.leviwilkerson.jwtimedev',
    beta: 'com.leviwilkerson.jwtimebeta',
  }[process.env.APP_VARIANT] ?? 'com.leviwilkerson.jwtime'

const APP_GROUP = `group.${BUNDLE_ID}`

/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
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
    'com.apple.security.application-groups': [APP_GROUP],
  },
}
