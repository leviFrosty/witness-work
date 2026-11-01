const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')

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
