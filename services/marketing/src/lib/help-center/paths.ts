import { SITE_ORIGIN } from '../site.ts'
import { DEFAULT_LOCALE, type HelpLocale } from './locales.ts'

export const SITE_URL = SITE_ORIGIN
export const HELP_BASE = '/help'
export const BUNDLE_BASE = `${HELP_BASE}/bundle`
export const MANIFEST_PATH = `${BUNDLE_BASE}/manifest.json`

export function helpPageUrl(
  locale: HelpLocale,
  category?: string,
  slug?: string
): string {
  return [
    HELP_BASE,
    locale === DEFAULT_LOCALE ? undefined : locale,
    category,
    category ? slug : undefined,
  ]
    .filter(Boolean)
    .join('/')
}

export const bundlePath = (locale: HelpLocale) =>
  `${BUNDLE_BASE}/${locale}.json`

export const bundleUrl = (locale: HelpLocale) =>
  new URL(bundlePath(locale), SITE_ORIGIN).href
