const { SourceSkips } = require('expo/fingerprint')

module.exports = {
  sourceSkips:
    SourceSkips.ExpoConfigRuntimeVersionIfString |
    SourceSkips.ExpoConfigVersions |
    SourceSkips.ExpoConfigExtraSection |
    SourceSkips.PackageJsonScriptsAll |
    SourceSkips.GitIgnore,
  extraSources: [
    { type: 'dir', filePath: 'config/ota-keys', reasons: ['otaSigningKeys'] },
    { type: 'dir', filePath: 'targets', reasons: ['appleTargets'] },
    { type: 'dir', filePath: 'src/assets/icons', reasons: ['alternateIcons'] },
  ],
  ignorePaths: [
    'targets/*/generated.entitlements',
    'targets/*/Assets.xcassets/**',

    'targets/wear-os/**',

    'node_modules/react-native-maps/ios/AirMaps/RNMapsDefines.h',

    'src/locales/en-US.json',
  ],
}
