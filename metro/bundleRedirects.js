const path = require('node:path')

const commonJsPackages = [
  'awesome-phonenumber',

  '@posthog/core',

  '@hot-updater/protocol',
]

const nativeStubs = [
  {
    request: '@revenuecat/purchases-js-hybrid-mappings',
    stub: 'revenueCatBrowserMode.js',
  },
  {
    request: './LogoSVG',
    from: `${path.sep}react-native-qrcode-svg${path.sep}`,
    stub: 'qrCodeLogoSvg.js',
  },
]

const isPackageRequest = (request, name) =>
  request === name || request.startsWith(`${name}/`)

function bundleRedirect(request, originModulePath, platform) {
  if (commonJsPackages.some((name) => isPackageRequest(request, name)))
    return { commonJs: true }
  if (platform !== 'ios' && platform !== 'android') return null
  const stub = nativeStubs.find(
    (entry) =>
      entry.request === request &&
      (!entry.from || originModulePath.includes(entry.from))
  )
  return stub ? { stub: path.join(__dirname, 'stubs', stub.stub) } : null
}

module.exports = { bundleRedirect, commonJsPackages, nativeStubs }
