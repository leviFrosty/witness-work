import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  withTextInputDirection,
} = require('./with-android-text-input-direction')
const { AndroidConfig, XML } = require('expo/config-plugins')

// Expo's template `styles.xml`.
const template = () =>
  XML.parseXMLAsync(
    [
      '<resources>',
      '  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">',
      '    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>',
      '  </style>',
      '</resources>',
    ].join('\n')
  )

const item = (xml: unknown, parent: { name: string }, name: string) =>
  AndroidConfig.Styles.getStylesItem({ xml, parent, name })?._

it('reads a field with no letters left to right', async () => {
  const xml = withTextInputDirection(await template())

  const style = { name: 'TextInputDirection' }
  expect(AndroidConfig.Styles.getStyleParent(xml, style)?.$.parent).toBe(
    'Widget.AppCompat.EditText'
  )
  expect(item(xml, style, 'android:textDirection')).toBe('firstStrongLtr')
  const theme = AndroidConfig.Styles.getAppThemeGroup()
  expect(item(xml, theme, 'editTextStyle')).toBe('@style/TextInputDirection')
  // The template's own items stay.
  expect(item(xml, theme, 'android:editTextBackground')).toBe(
    '@drawable/rn_edit_text_material'
  )
})

it('is idempotent', async () => {
  const once = withTextInputDirection(await template())
  const twice = withTextInputDirection(structuredClone(once))
  expect(twice).toEqual(once)
})
