import { existsSync, readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { bundleRedirect, commonJsPackages, nativeStubs, webStubs } =
  require('./bundleRedirects') as typeof import('./bundleRedirects')

const root = path.resolve(__dirname, '..')
const app = path.join(root, 'src/app/App.tsx')
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
