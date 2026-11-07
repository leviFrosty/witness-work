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

const webStubs = [
  { request: 'lottie-react-native', stub: 'lottieView.tsx' },
  { request: 'react-native-maps', stub: 'mapView.tsx' },
  { request: 'expo-notifications', stub: 'notifications.ts' },

  { request: 'expo/internal/async-require-module', stub: 'asyncRequire.ts' },
]

const reactNativeWeb = `${path.sep}react-native-web${path.sep}`
const webModules = [
  {
    request: './createMMKV',
    from: `${path.sep}react-native-mmkv${path.sep}`,
    module: 'src/lib/webStorage/webMmkv.ts',
  },
  {
    request: '@react-native-async-storage/async-storage',
    module: 'src/lib/webStorage/webAsyncStorage.ts',
  },

  ...['react-native-web/dist/exports/Share', './exports/Share'].map(
    (request) => ({
      request,
      ...(request.startsWith('.') && { from: reactNativeWeb }),
      module: 'src/vendor/web/share.ts',
    })
  ),

  ...['react-native-web/dist/exports/Alert', './exports/Alert'].map(
    (request) => ({
      request,
      ...(request.startsWith('.') && { from: reactNativeWeb }),
      module: 'src/vendor/web/alert.ts',
    })
  ),

  {
    request: './fetchThenEval',
    from: `${path.sep}${path.join('expo', 'build', 'async-require')}${path.sep}`,
    module: 'src/vendor/web/fetchThenEval.ts',
  },
]

const matches = (entry, request, originModulePath) =>
  entry.request === request &&
  (!entry.from || originModulePath.includes(entry.from))

const isPackageRequest = (request, name) =>
  request === name || request.startsWith(`${name}/`)

function bundleRedirect(request, originModulePath, platform) {
  if (commonJsPackages.some((name) => isPackageRequest(request, name)))
    return { commonJs: true }
  if (platform === 'web') {
    const web = webModules.find((entry) =>
      matches(entry, request, originModulePath)
    )
    if (web) return { stub: path.join(__dirname, '..', web.module) }
    const stub = webStubs.find((entry) => entry.request === request)
    return stub
      ? { stub: path.join(__dirname, '..', 'src', 'vendor', 'web', stub.stub) }
      : null
  }
  if (platform !== 'ios' && platform !== 'android') return null
  const stub = nativeStubs.find((entry) =>
    matches(entry, request, originModulePath)
  )
  return stub ? { stub: path.join(__dirname, 'stubs', stub.stub) } : null
}

module.exports = {
  bundleRedirect,
  commonJsPackages,
  nativeStubs,
  webStubs,
  webModules,
}
