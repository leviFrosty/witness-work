const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins')

const STYLE = 'TextInputDirection'

module.exports = (config) =>
  withAndroidStyles(config, (config) => {
    config.modResults = withTextInputDirection(config.modResults)
    return config
  })

function withTextInputDirection(xml) {
  const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles
  xml = assignStylesValue(xml, {
    add: true,
    parent: { name: STYLE, parent: 'Widget.AppCompat.EditText' },
    name: 'android:textDirection',
    value: 'firstStrongLtr',
  })
  return assignStylesValue(xml, {
    add: true,
    parent: getAppThemeGroup(),
    name: 'editTextStyle',
    value: `@style/${STYLE}`,
  })
}

module.exports.withTextInputDirection = withTextInputDirection
