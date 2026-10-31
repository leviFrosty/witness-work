import { SITE_ORIGIN } from '../site.ts'
import { DEFAULT_LOCALE, type HelpLocale } from './locales.ts'

export const SITE_URL = SITE_ORIGIN
export const HELP_BASE = '/help'
export const BUNDLE_BASE = `${HELP_BASE}/bundle`
export const MANIFEST_PATH = `${BUNDLE_BASE}/manifest.json`

/** The Help Center page for a locale, category, or question. */
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

/**
 * A bundle's absolute URL, as the manifest lists it. Absolute, so app versions
 * that fetch the manifest from the old site and follow its 301 still resolve
 * the bundles here.
 */
export const bundleUrl = (locale: HelpLocale) =>
  new URL(bundlePath(locale), SITE_ORIGIN).href
