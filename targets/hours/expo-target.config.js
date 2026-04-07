/**
 * @bacons/apple-targets configuration for the Hours stub widget.
 *
 * This widget is intentionally minimal — it exists to verify the snapshot
 * pipeline (JS → App Group → Swift → WidgetCenter) end-to-end. Real widget UIs
 * are added in follow-up PRs.
 *
 * The App Group identifier is mirrored from the host app's bundle id so the
 * dev variant points at `group.com.leviwilkerson.jwtimedev` and the prod
 * variant at `group.com.leviwilkerson.jwtime` automatically.
 */
const IS_DEV = process.env.APP_VARIANT === 'development'

const APP_GROUP = IS_DEV
  ? 'group.com.leviwilkerson.jwtimedev'
  : 'group.com.leviwilkerson.jwtime'

/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  icon: '../../src/assets/icon.png',
  deploymentTarget: '17.0',
  colors: {
    $accent: '#4BD27C',
    $widgetBackground: '#FFFFFF',
  },
  entitlements: {
    'com.apple.security.application-groups': [APP_GROUP],
  },
}
