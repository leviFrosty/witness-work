const { getPostHogExpoConfig } = require('posthog-react-native/metro')
const path = require('node:path')
const { lucidePackageDir } = require('./babel/lucide-imports')

const config = getPostHogExpoConfig(__dirname)
// Temporary i18n-js workaround: https://stackoverflow.com/questions/75876705/i18n-js-unable-to-resolve-make-plural-from-pluralization-js
// Adds support for `mjs` files
config.resolver.sourceExts.push('mjs')

// babel/lucide-imports.js rewrites icon imports to per-icon files such as
// `lucide-react-native/dist/esm/icons/plus.mjs`. The package's `exports` map
// doesn't list them, so resolve those subpaths by file path instead.
const resolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest
  if (moduleName.startsWith('lucide-react-native/dist/')) {
    return resolve(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    )
  }
  return resolve(context, moduleName, platform)
}

// Transformed files keep the rewritten icon paths in Metro's cache; a lucide
// upgrade that renames icon files must invalidate them.
const lucideVersion = require(
  path.join(lucidePackageDir(__dirname), 'package.json')
).version
config.cacheVersion = `${config.cacheVersion ?? ''}+lucide-${lucideVersion}`

module.exports = config
