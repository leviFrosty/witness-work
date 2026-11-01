import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isRTL: false,
  allowRTL: vi.fn(),
  forceRTL: vi.fn(),
}))
const storage = vi.hoisted(() => new Map<string, string | boolean>())

vi.mock('react-native', () => ({ I18nManager: native }))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getBoolean: (key: string) => storage.get(key) as boolean | undefined,
    getString: (key: string) => storage.get(key) as string | undefined,
    set: (key: string, value: string | boolean) => storage.set(key, value),
    delete: (key: string) => storage.delete(key),
    contains: (key: string) => storage.has(key),
  },
}))

import {
  applyLayoutDirectionAtLaunch,
  isDevForceRtl,
  isRtlLocale,
  setDevForceRtl,
  syncLayoutDirection,
} from '@/lib/rtl'

beforeEach(() => {
  native.isRTL = false
  native.allowRTL.mockClear()
  native.forceRTL.mockClear()
  storage.clear()
  vi.stubGlobal('__DEV__', true)
})

describe('isRtlLocale', () => {
  it('reads the language subtag', () => {
    for (const tag of ['ar', 'ar-EG', 'ar-sa', 'he-IL', 'fa', 'ur-PK', 'iw'])
      expect(isRtlLocale(tag)).toBe(true)
    for (const tag of ['en-us', 'ja-jp', 'zh-hant-tw', 'arn', 'pt-br', 'es'])
      expect(isRtlLocale(tag)).toBe(false)
  })

  it('reads a script subtag', () => {
    expect(isRtlLocale('pa-Arab-PK')).toBe(true)
    expect(isRtlLocale('az_arab')).toBe(true)
    expect(isRtlLocale('ku-latn')).toBe(false)
  })
})

describe('syncLayoutDirection', () => {
  it('forces RTL for an RTL Language', () => {
    expect(syncLayoutDirection('ar')).toEqual({ rtl: true, needsReload: true })
    expect(native.allowRTL).toHaveBeenCalledWith(true)
    expect(native.forceRTL).toHaveBeenCalledWith(true)
  })

  it('turns RTL off for an LTR Language, even on an RTL device', () => {
    native.isRTL = true
    expect(syncLayoutDirection('en-us')).toEqual({
      rtl: false,
      needsReload: true,
    })
    expect(native.allowRTL).toHaveBeenCalledWith(false)
    expect(native.forceRTL).toHaveBeenCalledWith(false)
  })

  it('needs no reload when the direction already matches', () => {
    expect(syncLayoutDirection('de-de').needsReload).toBe(false)
  })

  it('lets the dev switch mirror an LTR Language', () => {
    setDevForceRtl(true)
    expect(isDevForceRtl()).toBe(true)
    expect(syncLayoutDirection('en-us').rtl).toBe(true)
    setDevForceRtl(false)
    expect(syncLayoutDirection('en-us').rtl).toBe(false)
  })

  it('ignores the dev switch in release builds', () => {
    setDevForceRtl(true)
    vi.stubGlobal('__DEV__', false)
    expect(isDevForceRtl()).toBe(false)
    expect(syncLayoutDirection('en-us').rtl).toBe(false)
  })
})

describe('applyLayoutDirectionAtLaunch', () => {
  it('reloads once on a mismatch, never in a loop', () => {
    const reload = vi.fn()
    native.isRTL = true
    expect(applyLayoutDirectionAtLaunch('en-us', reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    expect(applyLayoutDirectionAtLaunch('en-us', reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again after a launch in the right direction', () => {
    const reload = vi.fn()
    native.isRTL = true
    applyLayoutDirectionAtLaunch('en-us', reload)
    native.isRTL = false
    expect(applyLayoutDirectionAtLaunch('en-us', reload)).toBe(false)
    native.isRTL = true
    expect(applyLayoutDirectionAtLaunch('en-us', reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('doesn’t reload when the direction matches', () => {
    const reload = vi.fn()
    expect(applyLayoutDirectionAtLaunch('fr-fr', reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
