const { withSettingsGradle } = require('expo/config-plugins')

const MODULE = ':wear'
/** Relative to the generated `android/` directory. */
const SOURCE_DIR = '../targets/wear-os'

/**
 * Adds the Wear OS app to the generated Android project as the `:wear` module,
 * so `expo prebuild` and EAS keep producing it. The sources stay in
 * `targets/wear-os` (Gradle builds them in place, with outputs under
 * `android/build/wear`); nothing is copied, so `android/` stays disposable.
 * `targets/wear-os/build.gradle` takes the application id, version and signing
 * from `:app`, which the Wearable Data Layer and Google Play require.
 *
 * The phone app's own APK doesn't include the watch app: build it with
 * `:wear:assembleDebug`, or `:wear:bundleRelease` for Play (docs/build.md).
 */
function addWearModule(contents) {
  if (contents.includes(`include '${MODULE}'`)) return contents
  return `${contents.trimEnd()}

// Wear OS app (plugins/with-wear-os.js).
include '${MODULE}'
project('${MODULE}').projectDir = new File(rootDir, '${SOURCE_DIR}')
`
}

module.exports = (config) =>
  withSettingsGradle(config, (config) => {
    config.modResults.contents = addWearModule(config.modResults.contents)
    return config
  })

module.exports.addWearModule = addWearModule
