import { HELP_BASE } from './help-center/paths.ts'
import {
  DEFAULT_LOCALE,
  isHelpLocale,
  type HelpLocale,
} from './help-center/locales.ts'
import { SITE_ORIGIN } from './site.ts'

/**
 * The site's pages (docs/adr/0042-witnesswork-app-domain.md §5). English is
 * unprefixed; every other locale leads the path.
 */
export const PRIVACY_PATH = '/privacy'
export const TERMS_PATH = '/terms'
export const GET_PATH = '/get'

const localized = (locale: HelpLocale, path: string) =>
  locale === DEFAULT_LOCALE ? path || '/' : `/${locale}${path}`

export const landingPath = (locale: HelpLocale) => localized(locale, '')

export const supportPath = (locale: HelpLocale) => localized(locale, '/support')

export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).href

/** The locale a page is in, from its path (for `<html lang dir>`). */
export function pageLocale(pathname: string): HelpLocale {
  const parts = pathname.split('/').filter(Boolean)
  const help = `/${parts[0]}` === HELP_BASE
  const candidate = help ? parts[1] : parts[0]
  return candidate && isHelpLocale(candidate) ? candidate : DEFAULT_LOCALE
}
