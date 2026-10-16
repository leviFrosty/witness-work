import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, string | boolean>())

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false, allowRTL: vi.fn(), forceRTL: vi.fn() },
}))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getBoolean: (key: string) => storage.get(key) as boolean | undefined,
    set: (key: string, value: string | boolean) => storage.set(key, value),
    delete: (key: string) => storage.delete(key),
  },
}))

import { nativeLocale, numberLocale } from '@/lib/nativeLocale'
import { setDevForceRtl } from '@/lib/rtl'

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('__DEV__', true)
})

describe('numberLocale', () => {
  it('asks for Arabic-Indic digits in Arabic', () => {
    expect(numberLocale('ar')).toBe('ar-u-nu-arab')
    expect(numberLocale('ar-EG')).toBe('ar-eg-u-nu-arab')
  })

  it('leaves Languages with Latin digits as they are', () => {
    for (const language of ['en-us', 'de-de', 'zh-hans-cn', 'bem-zm', 'he'])
      expect(numberLocale(language)).toBe(language)
  })
})

describe('nativeLocale', () => {
  it('lays out right to left for an RTL Language only', () => {
    expect(nativeLocale('ar')).toEqual({
      rtl: true,
      numberLocale: 'ar-u-nu-arab',
    })
    expect(nativeLocale('en-us')).toEqual({ rtl: false, numberLocale: 'en-us' })
  })

  it('follows the dev Force Right to Left switch, keeping the digits', () => {
    setDevForceRtl(true)
    expect(nativeLocale('en-us')).toEqual({ rtl: true, numberLocale: 'en-us' })
  })
})
