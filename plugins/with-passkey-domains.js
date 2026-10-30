const { withInfoPlist } = require('expo/config-plugins')

const KEY = 'WWPasskeyDomains'
const PREFIX = 'webcredentials:'

/**
 * Writes the hosts this build claims as `webcredentials:` associated domains
 * into Info.plist (`WWPasskeyDomains`), so `modules/passkeys` can answer
 * `domain_not_associated` before asking for an RP ID the build can't use. The
 * signed entitlements aren't readable at runtime; this copy comes from the same
 * `ios.associatedDomains` list in `app.config.ts`.
 *
 * @param {import('expo/config').ExpoConfig} config
 */
module.exports = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults[KEY] = webCredentialsDomains(
      config.ios?.associatedDomains
    )
    return config
  })

/** `webcredentials:host?mode=developer` → `host`. Other services are dropped. */
function webCredentialsDomains(associatedDomains) {
  return (associatedDomains ?? [])
    .filter((entry) => entry.startsWith(PREFIX))
    .map((entry) => entry.slice(PREFIX.length).split('?')[0])
}

module.exports.webCredentialsDomains = webCredentialsDomains
