import type { HelpCenter, UiKey } from '@/lib/help-center/load'
import { DEFAULT_LOCALE, type HelpLocale } from '@/lib/help-center/locales'

export type { UiKey }

export function uiString(center: HelpCenter, locale: HelpLocale, key: UiKey) {
  return center.ui[locale]?.[key] ?? center.ui[DEFAULT_LOCALE]?.[key] ?? key
}
