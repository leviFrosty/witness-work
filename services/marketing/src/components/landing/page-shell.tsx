import type { ReactNode } from 'react'
import { localeDirection, type HelpLocale } from '@/lib/help-center/locales'
import { messagesFor, type LandingLocale } from './i18n'
import { LandingFooter } from './sections/footer'
import { LandingNav } from './sections/nav'

/**
 * The landing page's frame for WitnessWork's other pages (the Help Center, the
 * policies): its dark canvas, nav, and footer, in `locale`. `children` brings
 * its own `<main id="main">`.
 */
export function WitnessWorkPage({
  locale,
  languageHref,
  available,
  children,
}: {
  locale: LandingLocale
  /** The same page in another language, for the language pickers. */
  languageHref?: (locale: HelpLocale) => string
  /** Languages this page is translated into (the rest show English). */
  available?: (locale: HelpLocale) => boolean
  children: ReactNode
}) {
  const t = messagesFor(locale)
  const dir = localeDirection(locale)
  return (
    <div
      data-page='ww'
      lang={locale}
      dir={dir}
      className='relative flex min-h-screen flex-col'
    >
      <meta name='theme-color' content='#030604' />
      <script async src='/landing.js' />
      <LandingNav
        locale={locale}
        t={t}
        onLanding={false}
        languageHref={languageHref}
        available={available}
      />
      {children}
      <LandingFooter
        locale={locale}
        t={t}
        languageHref={languageHref}
        available={available}
      />
    </div>
  )
}
