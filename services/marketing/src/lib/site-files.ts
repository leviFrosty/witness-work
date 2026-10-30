import type { HelpCenter, HelpQuestion } from './help-center/load.ts'
import { DEFAULT_LOCALE, HELP_LOCALES } from './help-center/locales.ts'
import { BUNDLE_BASE, helpPageUrl } from './help-center/paths.ts'
import {
  absoluteUrl,
  landingPath,
  PRIVACY_PATH,
  supportPath,
  TERMS_PATH,
} from './paths.ts'
import { SITE } from './site.ts'

/**
 * The site's crawler and header files, written into `public/` with the Help
 * Center's (src/vite/site-files.ts). They depend on the build's environment:
 * the staging site is never indexed.
 */
export function robotsTxt(): string {
  if (!SITE.indexable) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`
}

/**
 * Only the site itself, plus the help-search Worker for the Help Center's
 * search box. Inline style attributes stay allowed (React `style` props); every
 * script is a file.
 */
function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${SITE.helpSearchOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/**
 * Workers Static Assets `_headers`
 * (https://developers.cloudflare.com/workers/static-assets/headers/).
 */
export function headersFile(): string {
  const rules: Record<string, string[]> = {
    '/*': [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Strict-Transport-Security: max-age=31536000',
      `Content-Security-Policy: ${contentSecurityPolicy()}`,
      ...(SITE.indexable ? [] : ['X-Robots-Tag: noindex']),
    ],
    // The app downloads these (docs/help-center.md); ETags come from the
    // asset hashes.
    [`${BUNDLE_BASE}/*`]: [
      'Access-Control-Allow-Origin: *',
      'Cache-Control: public, max-age=0, must-revalidate',
    ],
    '/*.md': ['Content-Type: text/markdown; charset=utf-8'],
    '/llms.txt': ['Content-Type: text/plain; charset=utf-8'],
    '/llms-full.txt': ['Content-Type: text/plain; charset=utf-8'],
    // Vite's hashed build output never changes under the same name.
    '/assets/*': ['Cache-Control: public, max-age=31536000, immutable'],
  }
  return Object.entries(rules)
    .map(([pattern, headers]) =>
      [pattern, ...headers.map((header) => `  ${header}`)].join('\n')
    )
    .join('\n')
    .concat('\n')
}

type SitemapUrl = {
  loc: string
  alternates: { hreflang: string; href: string }[]
}

/** One entry per language, each listing every language and `x-default`. */
function cluster(
  locales: readonly (typeof HELP_LOCALES)[number][],
  pathFor: (locale: (typeof HELP_LOCALES)[number]) => string
): SitemapUrl[] {
  const alternates = locales.map((locale) => ({
    hreflang: locale,
    href: absoluteUrl(pathFor(locale)),
  }))
  const all = [
    ...alternates,
    { hreflang: 'x-default', href: absoluteUrl(pathFor(DEFAULT_LOCALE)) },
  ]
  return alternates.map((alternate) => ({
    loc: alternate.href,
    alternates: all,
  }))
}

/**
 * Canonical pages only. A Help Center answer that isn't translated yet shows
 * English under the locale's path and canonicalizes to the English page, so
 * only its translations are listed. /get only forwards to the stores, and stays
 * out.
 */
export function sitemapUrls(center: HelpCenter): SitemapUrl[] {
  const translated = (question: HelpQuestion) =>
    HELP_LOCALES.filter((locale) => question.translations[locale])
  return [
    ...cluster(HELP_LOCALES, landingPath),
    ...cluster(HELP_LOCALES, supportPath),
    { loc: absoluteUrl(PRIVACY_PATH), alternates: [] },
    { loc: absoluteUrl(TERMS_PATH), alternates: [] },
    ...cluster(HELP_LOCALES, (locale) => helpPageUrl(locale)),
    ...center.categories.flatMap((category) =>
      cluster(HELP_LOCALES, (locale) => helpPageUrl(locale, category))
    ),
    ...center.questions.flatMap((question) =>
      cluster(translated(question), (locale) =>
        helpPageUrl(locale, question.category, question.slug)
      )
    ),
  ]
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export function sitemapXml(center: HelpCenter): string {
  const urls = sitemapUrls(center).map(({ loc, alternates }) =>
    [
      '<url>',
      `<loc>${escapeXml(loc)}</loc>`,
      ...alternates.map(
        ({ hreflang, href }) =>
          `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`
      ),
      '</url>',
    ].join('')
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}
