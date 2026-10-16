const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')

/**
 * Lists the app's languages in `res/xml/locales_config.xml`, so Android 13+
 * offers them in Settings > App languages.
 *
 * The `supportedLocales` of expo-localization writes the same file, but sets
 * `resourceConfigurations` to the list, which strips every other locale's
 * resources from the APK, libraries' included. Their Chinese is `zh-rCN` and
 * `zh-rTW`, which `b+zh+Hans` doesn't keep, so Chinese users would lose the
 * translations of Android and Google UI they have today.
 *
 * @param {import('expo/config').ExpoConfig} config
 * @param {{ locales: string[] }} props BCP 47 tags, e.g. `en`, `pt-BR`.
 */
module.exports = (config, { locales }) => {
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const folder = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      )
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(
        path.join(folder, 'locales_config.xml'),
        localeConfig(locales)
      )
      return config
    },
  ])
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0]
    if (application) {
      application.$['android:localeConfig'] = '@xml/locales_config'
    }
    return config
  })
}

/** The `locale-config` resource listing `locales`. */
function localeConfig(locales) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<locale-config xmlns:android="http://schemas.android.com/apk/res/android">',
    ...locales.map((locale) => `  <locale android:name="${locale}"/>`),
    '</locale-config>',
    '',
  ].join('\n')
}

module.exports.localeConfig = localeConfig
