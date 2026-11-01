const { withAppDelegate } = require('@expo/config-plugins')

const LOCAL_MODULES = [
  { importName: 'WidgetBridge', className: 'WidgetBridgeModule' },
  { importName: 'StopwatchBridge', className: 'StopwatchBridgeModule' },
  { importName: 'ICloudBridge', className: 'ICloudBridgeModule' },
  { importName: 'CalendarBridge', className: 'CalendarBridgeModule' },
  { importName: 'KeychainUuid', className: 'KeychainUuidModule' },
  { importName: 'AppAttest', className: 'AppAttestModule' },
  { importName: 'BuddiesKeychain', className: 'BuddiesKeychainModule' },
  { importName: 'PlaceSearch', className: 'PlaceSearchModule' },
  { importName: 'RouteDirections', className: 'RouteDirectionsModule' },
  { importName: 'WatchBridge', className: 'WatchBridgeModule' },
  { importName: 'DeviceSecrets', className: 'DeviceSecretsModule' },
  { importName: 'PointerStyle', className: 'PointerStyleModule' },
  { importName: 'DisplayRegions', className: 'DisplayRegionsModule' },
  { importName: 'SystemMenu', className: 'SystemMenuModule' },
  { importName: 'WindowControls', className: 'WindowControlsModule' },
  { importName: 'SoundEffects', className: 'SoundEffectsModule' },
  {
    importName: 'AppSwitcherPrivacy',
    className: 'AppSwitcherPrivacyModule',
  },
  {
    importName: 'SpeechTranscription',
    className: 'SpeechTranscriptionModule',
  },

  {
    importName: 'TextRecognitionBridge',
    className: 'TextRecognitionBridgeModule',
  },
]

const IMPORT_MARKER = '// with-force-load-local-modules:imports'
const REF_MARKER = '// with-force-load-local-modules:refs'

const patchAppDelegate = (contents) => {
  if (contents.includes(IMPORT_MARKER)) {
    for (const module of LOCAL_MODULES) {
      const declaration = `internal import ${module.importName}`
      const reference = `    _ = ${module.className}.self // retain in Release link`
      if (!contents.includes(declaration)) {
        contents = contents.replace(
          IMPORT_MARKER,
          `${IMPORT_MARKER}\n${declaration}`
        )
      }
      if (!contents.includes(reference)) {
        contents = contents.replace(REF_MARKER, `${REF_MARKER}\n${reference}`)
      }
    }
    return contents
  }

  const imports =
    `${IMPORT_MARKER}\n` +
    LOCAL_MODULES.map((m) => `internal import ${m.importName}`).join('\n') +
    '\n'

  const lastImportMatch = contents.match(/^(import\s+\S+\n)+/m)
  let patched
  if (lastImportMatch) {
    const end = lastImportMatch.index + lastImportMatch[0].length
    patched = contents.slice(0, end) + imports + contents.slice(end)
  } else {
    patched = imports + contents
  }

  const refs =
    `    ${REF_MARKER}\n` +
    LOCAL_MODULES.map(
      (m) => `    _ = ${m.className}.self // retain in Release link`
    ).join('\n') +
    '\n'

  patched = patched.replace(/(\)\s*->\s*Bool\s*\{\n)/, (match) => match + refs)

  return patched
}

module.exports = function withForceLoadLocalModules(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error(
        '[with-force-load-local-modules] expected Swift AppDelegate'
      )
    }
    config.modResults.contents = patchAppDelegate(config.modResults.contents)
    return config
  })
}

module.exports.LOCAL_MODULES = LOCAL_MODULES
