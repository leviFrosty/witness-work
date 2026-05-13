const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins')

/**
 * Declares the app's iCloud Drive ubiquity container on iOS so the
 * `icloud-bridge` local module can read/write the shared sync file across
 * devices.
 *
 * Mirrors the App Group split: dev builds point at
 * `iCloud.com.leviwilkerson.jwtimedev`, prod at
 * `iCloud.com.leviwilkerson.jwtime`, so dev installations never read prod user
 * data.
 *
 * The container identifier must also be registered in the Apple Developer
 * portal under the team configured in `app.config.ts`. EAS will fail
 * provisioning otherwise.
 *
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 * @param {{ containerIdentifier: string; containerDisplayName?: string }} props
 */
const withICloudContainer = (config, props) => {
  const { containerIdentifier, containerDisplayName = 'WitnessWork' } = props

  if (!containerIdentifier) {
    throw new Error(
      '[with-icloud-container] `containerIdentifier` is required (e.g. "iCloud.com.example.app")'
    )
  }

  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.icloud-container-identifiers'] = [
      containerIdentifier,
    ]
    c.modResults['com.apple.developer.ubiquity-container-identifiers'] = [
      containerIdentifier,
    ]
    // CloudDocuments is the capability for NSFileCoordinator-based document
    // sync; CloudKit is not required for this approach.
    const existingServices = c.modResults['com.apple.developer.icloud-services']
    const services = new Set(
      Array.isArray(existingServices) ? existingServices : []
    )
    services.add('CloudDocuments')
    c.modResults['com.apple.developer.icloud-services'] = Array.from(services)
    return c
  })

  config = withInfoPlist(config, (c) => {
    const existing = c.modResults.NSUbiquitousContainers || {}
    c.modResults.NSUbiquitousContainers = {
      ...existing,
      [containerIdentifier]: {
        NSUbiquitousContainerIsDocumentScopePublic: false,
        NSUbiquitousContainerName: containerDisplayName,
        NSUbiquitousContainerSupportedFolderLevels: 'None',
      },
    }
    return c
  })

  return config
}

module.exports = withICloudContainer
