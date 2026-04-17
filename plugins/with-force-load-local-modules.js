// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withAppDelegate } = require('@expo/config-plugins')

/**
 * Retains our local Expo modules (WidgetBridge, StopwatchBridge) in the main
 * app binary by referencing them directly from AppDelegate.swift.
 *
 * ## Background
 *
 * Local path-based pods under `modules/` get autolinked + their .a files built,
 * but in Release their Swift classes are only referenced as metatypes in the
 * generated `ExpoModulesProvider.swift` array literals. That lives inside a
 * Pods aggregate static lib, and the Release linker treats the metatype access
 * as weak enough to dead-strip the whole archive. Result:
 * `WidgetBridge.writeSnapshot` silently no-ops in production, widgets render
 * their placeholder ("—" / calendar icon) forever, and Live Activities never
 * start.
 *
 * ## Fix
 *
 * Reference the module classes from AppDelegate.swift (which is main-app code,
 * so its references are always strong enough to retain symbols). This mirrors
 * how first-party Expo modules with AppDelegate subscribers (expo-linking,
 * expo-background-task, etc.) naturally survive stripping.
 *
 * Earlier iterations tried podspec `user_target_xcconfig`, in-memory
 * OTHER_LDFLAGS on the Pods aggregate target, xcconfig appends with
 * `-force_load` (Xcode rejects: undeclared input) and `-all_load` (ignored in
 * practice). Only this approach is dependable.
 */
const LOCAL_MODULES = [
  { importName: 'WidgetBridge', className: 'WidgetBridgeModule' },
  { importName: 'StopwatchBridge', className: 'StopwatchBridgeModule' },
  { importName: 'ICloudBridge', className: 'ICloudBridgeModule' },
]

const IMPORT_MARKER = '// with-force-load-local-modules:imports'
const REF_MARKER = '// with-force-load-local-modules:refs'

const patchAppDelegate = (contents) => {
  if (contents.includes(IMPORT_MARKER)) return contents

  // `internal import` mirrors the AppDelegate's other Expo module
  // imports. Plain `import` fails to resolve for static-lib pods because
  // the main-app Swift module search configuration doesn't expose them.
  const imports =
    `${IMPORT_MARKER}\n` +
    LOCAL_MODULES.map((m) => `internal import ${m.importName}`).join('\n') +
    '\n'

  // Add imports at the top, after any existing imports.
  const lastImportMatch = contents.match(/^(import\s+\S+\n)+/m)
  let patched
  if (lastImportMatch) {
    const end = lastImportMatch.index + lastImportMatch[0].length
    patched = contents.slice(0, end) + imports + contents.slice(end)
  } else {
    patched = imports + contents
  }

  // Add a `_ = <Module>.self` stub inside the existing
  // `application(_:didFinishLaunchingWithOptions:)` method so the
  // metatype references are emitted as main-app object code.
  const refs =
    `    ${REF_MARKER}\n` +
    LOCAL_MODULES.map(
      (m) => `    _ = ${m.className}.self // retain in Release link`
    ).join('\n') +
    '\n'

  // Insert right after the `launchOptions:` parameter list ends (the
  // `) -> Bool {` line).
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
