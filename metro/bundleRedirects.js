const path = require('node:path')

/**
 * Packages that ship a CommonJS and an ES module build. Metro resolves an
 * `import` to one and a `require()` to the other, so when the app imports a
 * package that a dependency requires, the bundle holds two copies and the app
 * evaluates both. Every request for these resolves the CommonJS way instead.
 */
const commonJsPackages = [
  // The app imports it; react-native-international-phone-number requires it.
  'awesome-phonenumber',
  // The app imports it; posthog-react-native requires it.
  '@posthog/core',
  // @hot-updater/react-native imports it; its client plugins require it.
  '@hot-updater/protocol',
]

/**
 * Modules iOS and Android builds can't reach, swapped for a stub that throws if
 * one ever runs.
 */
const nativeStubs = [
  {
    // RevenueCat's browser mode (Expo Go, Rork, web) is the only caller of
    // purchases-js, an 800 KB library the SDK evaluates at launch. Our builds
    // always have the native module, so browser mode never starts.
    request: '@revenuecat/purchases-js-hybrid-mappings',
    stub: 'revenueCatBrowserMode.js',
  },
  {
    // Renders `QRCode`'s `logoSVG` through react-native-svg/css (css-tree and
    // its CSS data, css-select, entities). The app passes a bitmap `logo`.
    request: './LogoSVG',
    from: `${path.sep}react-native-qrcode-svg${path.sep}`,
    stub: 'qrCodeLogoSvg.js',
  },
]

/**
 * Packages the web build can't load, swapped for the web stand-ins in
 * `src/vendor/web` (ADR 0037). Each stand-in says what it keeps.
 */
const webStubs = [
  { request: 'lottie-react-native', stub: 'lottieView.tsx' },
  { request: 'react-native-maps', stub: 'mapView.tsx' },
  { request: 'expo-notifications', stub: 'notifications.ts' },
  // Metro's `import()` runtime (`asyncRequireModulePath`).
  { request: 'expo/internal/async-require-module', stub: 'asyncRequire.ts' },
]

/**
 * Modules the web build swaps for the app's own, because theirs save to
 * `localStorage`: react-native-mmkv's storage and AsyncStorage go to the
 * IndexedDB-backed store database instead (docs/web-storage.md).
 */
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
]

const matches = (entry, request, originModulePath) =>
  entry.request === request &&
  (!entry.from || originModulePath.includes(entry.from))

const isPackageRequest = (request, name) =>
  request === name || request.startsWith(`${name}/`)

/**
 * How Metro should treat a request: `commonJs` to resolve it with the `require`
 * condition, `stub` to replace it with that file (a stub, or on the web the
 * app's replacement), or `null` to leave it alone.
 */
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
