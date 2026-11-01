const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins')

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

    const existingServices = c.modResults['com.apple.developer.icloud-services']
    const services = new Set(
      Array.isArray(existingServices) ? existingServices : []
    )
    services.add('CloudDocuments')
    services.add('CloudKit')
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
