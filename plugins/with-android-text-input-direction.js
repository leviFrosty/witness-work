const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins')

const STYLE = 'TextInputDirection'

/**
 * Gives every text field the paragraph direction of its first letter, and left
 * to right when it has none.
 *
 * An Android text field takes its paragraph direction from its first letter,
 * else from the layout. In a right-to-left Language a field holding only
 * numbers ("415 555 0134" in Contacts search) is then a right-to-left
 * paragraph, which reorders the digit groups: "0134 555 415". iOS already reads
 * a line with no letters left to right. React Native has no prop for this, so
 * it goes on the style React Native's `EditText` reads its defaults from
 * (AppCompat's `editTextStyle`). Arabic text still starts with an Arabic letter
 * and stays right to left; the field's alignment (`textAlign`) doesn't change.
 *
 * @param {import('expo/config').ExpoConfig} config
 */
module.exports = (config) =>
  withAndroidStyles(config, (config) => {
    config.modResults = withTextInputDirection(config.modResults)
    return config
  })

/** `styles.xml` with the text field style added and set on the app theme. */
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
