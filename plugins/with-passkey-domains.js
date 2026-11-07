const { withInfoPlist } = require('expo/config-plugins')

const KEY = 'WWPasskeyDomains'
const PREFIX = 'webcredentials:'

module.exports = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults[KEY] = webCredentialsDomains(
      config.ios?.associatedDomains
    )
    return config
  })

function webCredentialsDomains(associatedDomains) {
  return (associatedDomains ?? [])
    .filter((entry) => entry.startsWith(PREFIX))
    .map((entry) => entry.slice(PREFIX.length).split('?')[0])
}

module.exports.webCredentialsDomains = webCredentialsDomains
