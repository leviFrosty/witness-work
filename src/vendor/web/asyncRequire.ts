const asyncRequire = require('expo/src/async-require/asyncRequireModule')

declare const __METRO_GLOBAL_PREFIX__: string | undefined

type Paths = Record<string, unknown> | null

/**
 * Expo's `import()` on the web, downloading the module's chunk first.
 *
 * Expo's version requires the module at once and downloads its chunk only if
 * that throws. But react-native-web installs `ErrorUtils`, and with it Metro
 * reports a module it doesn't have as a fatal error instead of throwing, so an
 * `import()` made after startup (a language picked later) crashed the page.
 * Expo's loader keeps each chunk's download, so asking for one that's already
 * loaded fetches nothing.
 */
function webAsyncRequire(moduleID: number, paths: Paths, moduleName?: string) {
  const chunk = paths?.[String(moduleID)]
  const loadChunk = (globalThis as Record<string, unknown>)[
    `${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync`
  ] as ((path: string) => Promise<void>) | undefined
  if (typeof chunk !== 'string' || !loadChunk)
    return asyncRequire(moduleID, paths, moduleName)
  return loadChunk(chunk).then(() => asyncRequire(moduleID, paths, moduleName))
}

// Its `prefetch` and worker helpers, unchanged.
Object.assign(webAsyncRequire, asyncRequire)

module.exports = webAsyncRequire
