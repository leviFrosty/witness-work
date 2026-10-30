import { I18nManager } from 'react-native'
import { applyDocumentDirection } from '@/lib/documentDirection'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

/**
 * The app, not the device or expo-localization, decides layout direction: it
 * follows the active app Language. See ADR 0026.
 */

// Languages written right to left, by language subtag.
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish (Sorani)
  'dv', // Dhivehi
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew (legacy code)
  'ks', // Kashmiri
  'ps', // Pashto
  'sd', // Sindhi
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
])
// Script subtags that make any language right to left (`az-arab`, `pa-arab`).
const RTL_SCRIPTS = new Set(['arab', 'hebr', 'syrc', 'thaa', 'nkoo', 'adlm'])

/** Whether `locale` (`ar`, `ar-EG`, `fa-ir`, `pa-Arab-PK`) reads right to left. */
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

/**
 * The developer Tools "Force RTL layout" switch: mirrors the app in whatever
 * Language is active, so screens can be laid out before a right-to-left
 * translation exists. Release builds ignore it.
 */
export function isDevForceRtl(): boolean {
  return __DEV__ && mmkvStorage.getBoolean(DEV_FORCE_RTL_KEY) === true
}

/** Saves the dev switch. Call `syncLayoutDirection` and reload to apply it. */
export function setDevForceRtl(on: boolean): void {
  if (on) mmkvStorage.set(DEV_FORCE_RTL_KEY, true)
  else mmkvStorage.delete(DEV_FORCE_RTL_KEY)
}

/**
 * Whether the app lays out right to left in `locale`: an RTL Language, or any
 * Language while the dev switch is on. The widgets and watch apps follow the
 * same answer (`src/lib/nativeLocale.ts`).
 */
export function isRtlLayoutFor(locale: string): boolean {
  return isDevForceRtl() || isRtlLocale(locale)
}

/**
 * Points React Native's layout direction at `locale` (the active app Language),
 * or at RTL while the dev switch is on.
 *
 * Both flags are set every time. `forceRTL` makes Arabic mirror even though iOS
 * only reports the app as RTL when the bundle has an Arabic localization.
 * `allowRTL(false)` keeps an English UI unmirrored on a phone set to Arabic.
 *
 * The new direction applies from the next JS load: `needsReload` says whether
 * the running app was laid out the other way. The web applies it at once.
 */
export function syncLayoutDirection(locale: string): {
  rtl: boolean
  needsReload: boolean
} {
  const rtl = isRtlLayoutFor(locale)
  if (applyDocumentDirection(rtl ? 'rtl' : 'ltr', locale))
    return { rtl, needsReload: false }
  I18nManager.allowRTL(rtl)
  I18nManager.forceRTL(rtl)
  return { rtl, needsReload: I18nManager.isRTL !== rtl }
}

/**
 * Launch-time `syncLayoutDirection`: when the app came up in the wrong
 * direction, reload once to apply the right one.
 *
 * The direction a reload was for is saved first, so if a reload didn't take
 * (React Native still reports the old direction) the next launch shows the app
 * as it is instead of reloading again. Returns whether it reloaded.
 */
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
