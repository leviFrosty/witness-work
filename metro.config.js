const { getPostHogExpoConfig } = require('posthog-react-native/metro')
const path = require('node:path')
const { lucidePackageDir } = require('./babel/lucide-imports')
const { bundleRedirect } = require('./metro/bundleRedirects')

const config = getPostHogExpoConfig(__dirname)

config.resolver.sourceExts.push('mjs')

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

config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  /[\\/]\.verify[\\/].*/,

  /[\\/]\.env[^\\/]*(?:[\\/].*)?$/,
]

const lucideVersion = require(
  path.join(lucidePackageDir(__dirname), 'package.json')
).version
config.cacheVersion = `${config.cacheVersion ?? ''}+lucide-${lucideVersion}`

config.cacheVersion += `+commit-${process.env.EXPO_PUBLIC_COMMIT_HASH ?? ''}`

module.exports = config
