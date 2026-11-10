import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({
  OS: 'ios' as string,
  select: (specifics: Record<string, unknown>) =>
    platform.OS in specifics ? specifics[platform.OS] : specifics.default,
}))
const device = vi.hoisted(() => ({ modelName: 'iPhone 15' as string | null }))
vi.mock('react-native', () => ({ Platform: platform }))
vi.mock('expo-device', () => device)
vi.mock('@/lib/locales', async () => {
  const { default: strings } = await import('@/locales/en-US.json')
  return {
    default: {
      t: (key: keyof typeof strings, values: Record<string, string> = {}) =>
        String(strings[key]).replace(/%\{(\w+)\}/g, (_, name) => values[name]),
    },
  }
})

import {
  deviceName,
  devicePlatform,
  syncDeviceName,
} from '@/lib/devicePlatform'
import { webDeviceName } from '@/lib/webDeviceName'

const WEBKIT = 'AppleWebKit/537.36 (KHTML, like Gecko)'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
const SAFARI_MAC = `${MAC} AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15`
const CHROME_MAC = `${MAC} ${WEBKIT} Chrome/141.0.0.0 Safari/537.36`
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0'

describe('devicePlatform', () => {
  beforeEach(() => {
    platform.OS = 'ios'
    device.modelName = 'iPhone 15'
  })

  it('names each platform, and the web is never iOS', () => {
    expect(devicePlatform()).toBe('ios')
    platform.OS = 'android'
    expect(devicePlatform()).toBe('android')
    platform.OS = 'web'
    expect(devicePlatform()).toBe('web')
  })

  it('names a phone by its model, or its OS without one', () => {
    expect(deviceName()).toBe('iPhone 15')
    device.modelName = null
    expect(deviceName()).toBe('iPhone')
    platform.OS = 'android'
    expect(deviceName()).toBe('Android')
  })

  it('names a browser from what the browser reveals', () => {
    platform.OS = 'web'
    device.modelName = null
    vi.stubGlobal('navigator', { userAgent: FIREFOX_MAC, maxTouchPoints: 0 })
    expect(deviceName()).toBe('Firefox on macOS')
    expect(syncDeviceName()).toBe('Firefox on macOS')
    vi.unstubAllGlobals()
  })

  it('leaves the name a phone syncs under as its model', () => {
    expect(syncDeviceName()).toBe('iPhone 15')
    device.modelName = null
    expect(syncDeviceName()).toBeNull()
    platform.OS = 'android'
    device.modelName = 'Pixel 9'
    expect(syncDeviceName()).toBe('Pixel 9')
  })
})

describe('webDeviceName', () => {
  it.each([
    [SAFARI_MAC, 'Safari on macOS'],
    [CHROME_MAC, 'Chrome on macOS'],
    [FIREFOX_MAC, 'Firefox on macOS'],
    [
      `${WINDOWS} ${WEBKIT} Chrome/141.0.0.0 Safari/537.36`,
      'Chrome on Windows',
    ],
    [
      `${WINDOWS} ${WEBKIT} Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0`,
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Firefox on Windows',
    ],
    [
      `${WINDOWS} ${WEBKIT} Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0`,
      'Opera on Windows',
    ],
    [
      `${WINDOWS} ${WEBKIT} Chrome/140.0.0.0 Safari/537.36 Vivaldi/7.6.3797.63`,
      'Vivaldi on Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Firefox on Linux',
    ],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/141.0.0.0 Chrome/141.0.0.0 Safari/537.36',
      'Chromium on Linux',
    ],
    [
      `Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${WEBKIT} Chrome/141.0.0.0 Safari/537.36`,
      'Chrome on ChromeOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
      'Chrome on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15',
      'Firefox on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/141.0.3537.57 Mobile/15E148 Safari/605.1.15',
      'Edge on iOS',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Safari on iPadOS',
    ],
    [
      `Mozilla/5.0 (Linux; Android 15; Pixel 9) ${WEBKIT} Chrome/141.0.0.0 Mobile Safari/537.36`,
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
      'Firefox on Android',
    ],
    [
      `Mozilla/5.0 (Linux; Android 15; SM-S938B) ${WEBKIT} SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36`,
      'Samsung Internet on Android',
    ],
    [
      `Mozilla/5.0 (Linux; Android 15; Pixel 9) ${WEBKIT} Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0`,
      'Edge on Android',
    ],
  ])('reads %s', (userAgent, name) => {
    expect(webDeviceName({ userAgent, maxTouchPoints: 0 })).toBe(name)
  })

  it('calls a Mac with a touch screen an iPad', () => {
    expect(webDeviceName({ userAgent: SAFARI_MAC, maxTouchPoints: 5 })).toBe(
      'Safari on iPadOS'
    )
    expect(webDeviceName({ userAgent: CHROME_MAC, maxTouchPoints: 5 })).toBe(
      'Chrome on iPadOS'
    )
  })

  it('believes client hints over the user agent', () => {
    const chromium = { brand: 'Chromium' }
    const noise = { brand: 'Not?A_Brand' }
    expect(
      webDeviceName({
        userAgent: CHROME_MAC,
        userAgentData: {
          brands: [noise, chromium, { brand: 'Brave' }],
          platform: 'macOS',
        },
      })
    ).toBe('Brave on macOS')
    expect(
      webDeviceName({
        userAgent: `${WINDOWS} ${WEBKIT} Chrome/141.0.0.0 Safari/537.36`,
        userAgentData: {
          brands: [{ brand: 'Microsoft Edge' }, chromium, noise],
          platform: 'Windows',
        },
      })
    ).toBe('Edge on Windows')
    expect(
      webDeviceName({
        userAgent: `Mozilla/5.0 (X11; Linux x86_64) ${WEBKIT} Chrome/141.0.0.0 Safari/537.36`,
        userAgentData: {
          brands: [{ brand: 'Google Chrome' }, chromium, noise],
          platform: 'Chrome OS',
        },
      })
    ).toBe('Chrome on ChromeOS')
    expect(
      webDeviceName({
        userAgentData: { brands: [chromium, noise], platform: 'Linux' },
      })
    ).toBe('Chromium on Linux')
  })

  it('shows the part it can tell, and a plain label when it can tell nothing', () => {
    expect(
      webDeviceName({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    ).toBe('Linux')
    expect(webDeviceName({ userAgent: 'Mozilla/5.0 Firefox/144.0' })).toBe(
      'Firefox'
    )
    expect(
      webDeviceName({ userAgentData: { brands: [], platform: 'Unknown' } })
    ).toBe('Web browser')
    expect(webDeviceName({ userAgent: '' })).toBe('Web browser')
    expect(webDeviceName({})).toBe('Web browser')
  })
})
