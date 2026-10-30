import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({
  OS: 'ios' as string,
  select: (specifics: Record<string, unknown>) =>
    platform.OS in specifics ? specifics[platform.OS] : specifics.default,
}))
const device = vi.hoisted(() => ({ modelName: 'iPhone 15' as string | null }))
vi.mock('react-native', () => ({ Platform: platform }))
vi.mock('expo-device', () => device)

import { deviceName, devicePlatform, webDeviceName } from '@/lib/devicePlatform'

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

  it('names a browser by its user agent', () => {
    platform.OS = 'web'
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Firefox/125.0',
    })
    expect(deviceName()).toBe('Firefox on Linux')
    vi.unstubAllGlobals()
  })
})

describe('webDeviceName', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Safari on Mac',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Chrome on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Firefox on Linux',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
      'Chrome on iPhone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
  ])('reads %s', (userAgent, name) => {
    expect(webDeviceName(userAgent)).toBe(name)
  })

  it('falls back to what it can tell, then to Browser', () => {
    expect(webDeviceName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux')
    expect(webDeviceName('')).toBe('Browser')
  })
})
