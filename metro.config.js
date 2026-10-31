const { getPostHogExpoConfig } = require('posthog-react-native/metro')
const path = require('node:path')
const { lucidePackageDir } = require('./babel/lucide-imports')
const { bundleRedirect } = require('./metro/bundleRedirects')

const config = getPostHogExpoConfig(__dirname)
// Temporary i18n-js workaround: https://stackoverflow.com/questions/75876705/i18n-js-unable-to-resolve-make-plural-from-pluralization-js
// Adds support for `mjs` files
config.resolver.sourceExts.push('mjs')

// babel/lucide-imports.js rewrites icon imports to per-icon files such as
// `lucide-react-native/dist/esm/icons/plus.mjs`. The package's `exports` map
// doesn't list them, so resolve those subpaths by file path instead.
// metro/bundleRedirects.js keeps one build of dual CommonJS/ESM packages and
// stubs out code iOS and Android can't reach.
const resolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest
  const redirect = bundleRedirect(
    moduleName,
    context.originModulePath,
    platform
  )
  if (redirect?.stub) return { type: 'sourceFile', filePath: redirect.stub }
  if (redirect?.commonJs)
    return resolve({ ...context, isESMImport: false }, moduleName, platform)
  if (moduleName.startsWith('lucide-react-native/dist/')) {
    return resolve(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    )
  }
  return resolve(context, moduleName, platform)
}

// `.verify/` holds the verification harness's state, screenshots and builds.
// Watching it would make every write there push a hot update, whose
// "Refreshing..." banner covers the header and swallows taps mid-drive.
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  /[\\/]\.verify[\\/].*/,
  // Expo DOM's project-wide context must never resolve environment files or
  // the OTA provider/signing credentials, even when they are gitignored.
  /[\\/]\.env[^\\/]*(?:[\\/].*)?$/,
  // services/ is its own pnpm workspace (the website and Workers), with its
  // own React; nothing in the app may resolve from it.
  new RegExp(
    `^${path.join(__dirname, 'services').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/].*`
  ),
]

// Transformed files keep the rewritten icon paths in Metro's cache; a lucide
// upgrade that renames icon files must invalidate them.
const lucideVersion = require(
  path.join(lucidePackageDir(__dirname), 'package.json')
).version
config.cacheVersion = `${config.cacheVersion ?? ''}+lucide-${lucideVersion}`
// Release builds inline this value; a warm transform cache must not keep the
// commit label from an earlier native build.
config.cacheVersion += `+commit-${process.env.EXPO_PUBLIC_COMMIT_HASH ?? ''}`

module.exports = config
