const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins')

const META_DATA = {
  firebase_messaging_auto_init_enabled: 'false',
  firebase_analytics_collection_deactivated: 'true',
}

module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = withFcmOnDemand(config.modResults)
    return config
  })

function withFcmOnDemand(manifest) {
  const { addMetaDataItemToMainApplication, getMainApplicationOrThrow } =
    AndroidConfig.Manifest
  const application = getMainApplicationOrThrow(manifest)
  for (const [name, value] of Object.entries(META_DATA))
    addMetaDataItemToMainApplication(application, name, value)
  return manifest
}

module.exports.withFcmOnDemand = withFcmOnDemand
