import { existsSync, readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { bundleRedirect, commonJsPackages, nativeStubs, webStubs, webModules } =
  require('./bundleRedirects') as typeof import('./bundleRedirects')

const root = path.resolve(__dirname, '..')
const app = path.join(root, 'src/app/App.tsx')
const mmkv = path.join(
  root,
  'node_modules/react-native-mmkv/lib/module/MMKV.js'
)
const qrCode = path.join(
  root,
  'node_modules/react-native-qrcode-svg/src/index.js'
)

describe('bundleRedirect', () => {
  it('resolves dual packages and their subpaths the CommonJS way', () => {
    for (const name of commonJsPackages) {
      expect(bundleRedirect(name, app, 'ios')).toEqual({ commonJs: true })
      expect(bundleRedirect(`${name}/sub`, app, 'android')).toEqual({
        commonJs: true,
      })
    }
    expect(bundleRedirect('@posthog/core-extra', app, 'ios')).toBeNull()
  })

  it('stubs RevenueCat browser mode on iOS and Android only', () => {
    const request = '@revenuecat/purchases-js-hybrid-mappings'
    for (const platform of ['ios', 'android'])
      expect(bundleRedirect(request, app, platform)?.stub).toMatch(
        /stubs[\\/]revenueCatBrowserMode\.js$/
      )
    expect(bundleRedirect(request, app, 'web')).toBeNull()
  })

  it('stubs only react-native-qrcode-svg’s own LogoSVG', () => {
    expect(bundleRedirect('./LogoSVG', qrCode, 'ios')?.stub).toMatch(
      /stubs[\\/]qrCodeLogoSvg\.js$/
    )
    expect(bundleRedirect('./LogoSVG', app, 'ios')).toBeNull()
    expect(bundleRedirect('./LogoSVG', qrCode, 'web')).toBeNull()
  })

  it('swaps MMKV’s storage and AsyncStorage for the store database on the web only', () => {
    expect(bundleRedirect('./createMMKV', mmkv, 'web')?.stub).toBe(
      path.join(root, 'src/lib/webStorage/webMmkv.ts')
    )
    expect(bundleRedirect('./createMMKV', app, 'web')).toBeNull()
    expect(bundleRedirect('./createMMKV', mmkv, 'ios')).toBeNull()
    const asyncStorage = '@react-native-async-storage/async-storage'
    expect(bundleRedirect(asyncStorage, app, 'web')?.stub).toBe(
      path.join(root, 'src/lib/webStorage/webAsyncStorage.ts')
    )
    expect(bundleRedirect(asyncStorage, app, 'android')).toBeNull()
  })

  it('swaps react-native-web’s Share and Alert for the app’s, on the web only', () => {
    const rnw = path.join(root, 'node_modules/react-native-web/dist/index.js')
    expect(bundleRedirect('./exports/Share', rnw, 'web')?.stub).toBe(
      path.join(root, 'src/vendor/web/share.ts')
    )
    expect(bundleRedirect('./exports/Alert', rnw, 'web')?.stub).toBe(
      path.join(root, 'src/vendor/web/alert.ts')
    )
    // Expo's Babel preset imports them by their deep paths.
    for (const name of ['Share', 'Alert'])
      expect(
        bundleRedirect(`react-native-web/dist/exports/${name}`, app, 'web')
          ?.stub
      ).toMatch(
        new RegExp(
          `src[\\\\/]vendor[\\\\/]web[\\\\/]${name.toLowerCase()}\\.ts$`
        )
      )
    expect(bundleRedirect('./exports/Share', rnw, 'ios')).toBeNull()
    expect(bundleRedirect('./exports/Share', app, 'web')).toBeNull()
  })

  it('loads web chunks through the app’s Trusted Types loader', () => {
    const loader = path.join(
      root,
      'node_modules/expo/build/async-require/loadBundle.js'
    )
    // The loader the redirect replaces, where Expo's runtime requires it.
    expect(existsSync(loader)).toBe(true)
    expect(readFileSync(loader, 'utf8')).toContain("from './fetchThenEval'")
    expect(bundleRedirect('./fetchThenEval', loader, 'web')?.stub).toBe(
      path.join(root, 'src/vendor/web/fetchThenEval.ts')
    )
    expect(bundleRedirect('./fetchThenEval', loader, 'ios')).toBeNull()
    expect(bundleRedirect('./fetchThenEval', app, 'web')).toBeNull()
  })

  it('swaps packages the web can’t load for web stand-ins, on the web only', () => {
    for (const { request } of webStubs) {
      expect(bundleRedirect(request, app, 'web')?.stub).toMatch(
        /src[\\/]vendor[\\/]web[\\/]/
      )
      for (const platform of ['ios', 'android'])
        expect(bundleRedirect(request, app, platform)).toBeNull()
    }
    expect(
      bundleRedirect('expo-notifications/build/Notifications.types', app, 'web')
    ).toBeNull()
  })

  it('points at modules that exist', () => {
    for (const name of commonJsPackages) {
      const manifest = JSON.parse(
        readFileSync(
          path.join(root, 'node_modules', name, 'package.json'),
          'utf8'
        )
      )
      expect(Object.keys(manifest.exports['.'])).toContain('require')
    }
    for (const { stub } of nativeStubs)
      expect(() =>
        require.resolve(path.join(__dirname, 'stubs', stub))
      ).not.toThrow()
    for (const { module } of webModules)
      expect(() => require.resolve(path.join(root, module))).not.toThrow()
    for (const build of ['module', 'commonjs'])
      expect(
        readFileSync(
          path.join(
            root,
            `node_modules/react-native-mmkv/lib/${build}/MMKV.js`
          ),
          'utf8'
        )
      ).toMatch(/from '\.\/createMMKV'|require\("\.\/createMMKV"\)/)
    for (const { stub } of webStubs)
      expect(existsSync(path.join(root, 'src/vendor/web', stub))).toBe(true)
    expect(
      readFileSync(
        path.join(root, 'node_modules/react-native-qrcode-svg/src/index.js'),
        'utf8'
      )
    ).toContain("import LogoSVG from './LogoSVG'")
  })
})

describe('stubbed code stays unused', () => {
  const sources = globSync('src/**/*.{ts,tsx}', { cwd: root }).filter(
    (file) => !/\.test\.tsx?$/.test(file)
  )

  it('never passes QRCode a logoSVG', () => {
    const users = sources.filter((file) =>
      /\blogoSVG\b/.test(readFileSync(path.join(root, file), 'utf8'))
    )
    expect(users).toEqual([])
  })

  it('throws if a stub ever runs', () => {
    const browserMode = require('./stubs/revenueCatBrowserMode')
    expect(() => browserMode.PurchasesCommon).toThrow(/browser mode/)
    const LogoSVG = require('./stubs/qrCodeLogoSvg')
    expect(() => LogoSVG()).toThrow(/logoSVG/)
  })
})
