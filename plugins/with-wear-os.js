const { withSettingsGradle } = require('expo/config-plugins')

const MODULE = ':wear'

const SOURCE_DIR = '../targets/wear-os'

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
