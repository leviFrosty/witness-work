const asyncRequire = require('expo/src/async-require/asyncRequireModule')

declare const __METRO_GLOBAL_PREFIX__: string | undefined

type Paths = Record<string, unknown> | null

function webAsyncRequire(moduleID: number, paths: Paths, moduleName?: string) {
  const chunk = paths?.[String(moduleID)]
  const loadChunk = (globalThis as Record<string, unknown>)[
    `${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync`
  ] as ((path: string) => Promise<void>) | undefined
  if (typeof chunk !== 'string' || !loadChunk)
    return asyncRequire(moduleID, paths, moduleName)
  return loadChunk(chunk).then(() => asyncRequire(moduleID, paths, moduleName))
}

Object.assign(webAsyncRequire, asyncRequire)

module.exports = webAsyncRequire
