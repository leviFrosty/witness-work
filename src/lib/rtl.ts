import { I18nManager } from 'react-native'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ks',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
])

const RTL_SCRIPTS = new Set(['arab', 'hebr', 'syrc', 'thaa', 'nkoo', 'adlm'])

export function isRtlLocale(locale: string): boolean {
  const [language, ...rest] = locale.toLowerCase().split(/[-_]/)
  if (rest.some((subtag) => subtag === 'latn' || subtag === 'cyrl'))
    return false
  return (
    RTL_LANGUAGES.has(language) ||
    rest.some((subtag) => RTL_SCRIPTS.has(subtag))
  )
}

const DEV_FORCE_RTL_KEY = 'layoutDirection.devForceRtl'
const RELOADED_FOR_KEY = 'layoutDirection.reloadedFor'

export function isDevForceRtl(): boolean {
  return __DEV__ && mmkvStorage.getBoolean(DEV_FORCE_RTL_KEY) === true
}

export function setDevForceRtl(on: boolean): void {
  if (on) mmkvStorage.set(DEV_FORCE_RTL_KEY, true)
  else mmkvStorage.delete(DEV_FORCE_RTL_KEY)
}

export function isRtlLayoutFor(locale: string): boolean {
  return isDevForceRtl() || isRtlLocale(locale)
}

export function syncLayoutDirection(locale: string): {
  rtl: boolean
  needsReload: boolean
} {
  const rtl = isRtlLayoutFor(locale)
  I18nManager.allowRTL(rtl)
  I18nManager.forceRTL(rtl)
  return { rtl, needsReload: I18nManager.isRTL !== rtl }
}

export function applyLayoutDirectionAtLaunch(
  locale: string,
  reload: () => void
): boolean {
  const { rtl, needsReload } = syncLayoutDirection(locale)
  const direction = rtl ? 'rtl' : 'ltr'
  if (!needsReload) {
    if (mmkvStorage.contains(RELOADED_FOR_KEY))
      mmkvStorage.delete(RELOADED_FOR_KEY)
    return false
  }
  if (mmkvStorage.getString(RELOADED_FOR_KEY) === direction) {
    logger.warn(`[layoutDirection] still not ${direction} after a reload`)
    return false
  }
  mmkvStorage.set(RELOADED_FOR_KEY, direction)
  logger.log(`[layoutDirection] reloading to lay out ${direction}`)
  reload()
  return true
}
