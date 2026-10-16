import { digitSystemFor } from '@/lib/digits'
import { isRtlLayoutFor } from '@/lib/rtl'

/**
 * How the widgets and the watch apps lay out and write numbers. They render
 * natively, where the system would follow the device's language or their own
 * bundle's, so the snapshots they read carry the app's choice
 * (`AppLanguage.swift`, `AppLanguage.kt`; ADR 0026).
 */
export type NativeLocale = {
  /** Lay out right to left, as the app does (dev switch included). */
  rtl: boolean
  /**
   * BCP 47 tag to write numbers in: the Language, plus its numbering system
   * when its digits aren't Latin (`ar-u-nu-arab`).
   */
  numberLocale: string
}

/**
 * `ar` → `ar-u-nu-arab`; a Language with Latin digits as it is. The digits are
 * the ones the app writes (`digitSystemFor`), which Apple's plain `ar` wouldn't
 * use.
 */
export function numberLocale(language: string): string {
  const tag = language.toLowerCase().replace(/_/g, '-')
  const system = digitSystemFor(tag)
  return system !== 'latn' && !tag.includes('-u-')
    ? `${tag}-u-nu-${system}`
    : tag
}

/** What a widget or watch snapshot needs to follow `language`, the app's. */
export function nativeLocale(language: string): NativeLocale {
  return { rtl: isRtlLayoutFor(language), numberLocale: numberLocale(language) }
}
