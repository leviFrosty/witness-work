import type { HelpCenter, UiKey } from '@/lib/help-center/load'
import { DEFAULT_LOCALE, type HelpLocale } from '@/lib/help-center/locales'

export type { UiKey }

/** A page string in `locale`, falling back to English. */
export function uiString(center: HelpCenter, locale: HelpLocale, key: UiKey) {
  return center.ui[locale]?.[key] ?? center.ui[DEFAULT_LOCALE]?.[key] ?? key
}
