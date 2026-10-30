import type { HelpCenter } from '../lib/help-center/load.ts'
import { DEFAULT_LOCALE, HELP_LOCALES } from '../lib/help-center/locales.ts'
import { helpPageUrl } from '../lib/help-center/paths.ts'
import {
  GET_PATH,
  landingPath,
  PRIVACY_PATH,
  supportPath,
  TERMS_PATH,
} from '../lib/paths.ts'

/**
 * Every page the build prerenders. The site is these files and nothing else:
 * ww-api serves the app-link paths on the same host (/accounts/handoff,
 * /contacts, /buddies/invite, /.well-known/*), so none of them may be here.
 */
export function sitePages(center: HelpCenter): string[] {
  return [
    ...HELP_LOCALES.map(landingPath),
    ...HELP_LOCALES.map(supportPath),
    PRIVACY_PATH,
    TERMS_PATH,
    GET_PATH,
    '/404',
    ...HELP_LOCALES.flatMap((locale) => [
      helpPageUrl(locale),
      ...center.categories.map((category) => helpPageUrl(locale, category)),
      ...center.questions.map((q) => helpPageUrl(locale, q.category, q.slug)),
    ]),
  ]
}

export const DEFAULT_PAGE = landingPath(DEFAULT_LOCALE)
