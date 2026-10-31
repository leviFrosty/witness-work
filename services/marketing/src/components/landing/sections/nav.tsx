import { ChevronDown, Globe, Menu } from 'lucide-react'
import {
  HELP_LOCALES,
  LOCALE_NAMES,
  type HelpLocale,
} from '@/lib/help-center/locales'
import { helpPageUrl } from '@/lib/help-center/paths'
import { landingPath, type LandingLocale, type LandingMessages } from '../i18n'

type LanguageProps = {
  locale: LandingLocale
  /** Where each language goes (its landing page by default). */
  hrefFor?: (locale: HelpLocale) => string
  /** Languages the page is translated into; the rest are marked English. */
  available?: (locale: HelpLocale) => boolean
}

/** Every language as a link, the current one marked. */
function LanguageOptions({
  locale,
  hrefFor = landingPath,
  available = () => true,
  className,
}: LanguageProps & { className?: string }) {
  return (
    <ul className={className}>
      {HELP_LOCALES.map((option) => (
        <li key={option}>
          <a
            href={hrefFor(option)}
            hrefLang={option}
            lang={option}
            data-locale={option}
            aria-current={option === locale ? 'page' : undefined}
            className='ww-popover-item'
          >
            {LOCALE_NAMES[option]}
            {option === locale ? (
              <span
                className='size-1.5 rounded-full bg-[var(--ww-green)]'
                aria-hidden
              />
            ) : (
              !available(option) && (
                <span
                  className='text-[11px] font-medium text-[var(--ww-faint)]'
                  lang='en'
                >
                  EN
                </span>
              )
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * A `<details>` list of every language (no JavaScript needed). Each goes to
 * that language's landing page unless `hrefFor` says otherwise, as the Help
 * Center does.
 */
export function LanguagePicker({
  label,
  align = 'end',
  up = false,
  primary = false,
  className,
  ...options
}: LanguageProps & {
  label: string
  align?: 'start' | 'end'
  up?: boolean
  /** The page's main picker (the nav's), for tests to find. */
  primary?: boolean
  className?: string
}) {
  return (
    <details
      className={`group relative ${className ?? ''}`}
      data-ww-close=''
      data-language-switcher={primary ? '' : undefined}
    >
      <summary
        className='ww-icon-btn flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden'
        aria-label={`${label}: ${LOCALE_NAMES[options.locale]}`}
      >
        <Globe className='size-[18px]' aria-hidden />
        <span className='text-sm font-medium'>
          {LOCALE_NAMES[options.locale]}
        </span>
        <ChevronDown
          className='size-3.5 opacity-60 transition-transform group-open:rotate-180'
          aria-hidden
        />
      </summary>
      <LanguageOptions
        {...options}
        className={`ww-popover absolute z-50 max-h-[min(70vh,26rem)] w-60 overflow-y-auto p-1.5 ${
          align === 'end' ? 'end-0' : 'start-0'
        } ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
      />
    </details>
  )
}

/**
 * The bar across the top of every WitnessWork page. On the landing page its
 * links jump to sections; elsewhere (the Help Center, the policies) they go
 * back to them, and `languageHref` points the language picker at the right
 * page.
 */
export function LandingNav({
  locale,
  t,
  onLanding = true,
  languageHref,
  available,
}: {
  locale: LandingLocale
  t: LandingMessages
  onLanding?: boolean
  languageHref?: (locale: HelpLocale) => string
  /** Languages this page is translated into (the rest show English). */
  available?: (locale: HelpLocale) => boolean
}) {
  const at = (hash: string) =>
    onLanding ? hash : `${landingPath(locale)}${hash}`
  const links = [
    { href: at('#features'), label: t.nav.features },
    { href: at('#devices'), label: t.nav.devices },
    { href: at('#privacy'), label: t.nav.privacy },
    { href: helpPageUrl(locale), label: t.nav.help },
  ]
  return (
    <header data-ww-nav='' className='ww-nav' suppressHydrationWarning>
      <a href='#main' className='ww-skip'>
        {t.nav.skip}
      </a>
      <nav className='mx-auto flex h-[var(--ww-nav-h)] w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8'>
        <a
          href={landingPath(locale)}
          className='flex min-h-11 items-center gap-2.5 rounded-xl text-[15px] font-semibold tracking-tight'
          aria-label={t.nav.home}
        >
          <img
            src='/images/icon.png'
            alt=''
            width={28}
            height={28}
            className='size-7 rounded-[8px] shadow-[0_0_0_1px_rgb(255_255_255/0.12)]'
          />
          <span className='ww-wordmark'>WitnessWork</span>
        </a>
        <ul className='hidden items-center gap-1 lg:flex'>
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className='ww-nav-link'>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className='flex items-center gap-1.5 sm:gap-2'>
          {/* On phones the language moves into the menu, leaving the bar
              room for the name and the download. */}
          <LanguagePicker
            locale={locale}
            label={t.nav.language}
            hrefFor={languageHref}
            available={available}
            primary
            className='max-sm:hidden'
          />
          <a
            href={at('#download')}
            data-ww-get=''
            suppressHydrationWarning
            className='ww-btn ww-btn-primary ww-nav-cta'
          >
            {t.nav.getApp}
          </a>
          <details className='relative lg:hidden' data-ww-close=''>
            <summary
              className='ww-icon-btn flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden'
              aria-label={t.nav.menu}
            >
              <Menu className='size-5' aria-hidden />
            </summary>
            <div className='ww-popover ww-menu absolute end-0 top-full z-50 mt-2 w-64 p-1.5'>
              <ul>
                {links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className='ww-popover-item text-base'>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <details className='group/lang mt-1.5 border-t border-[var(--ww-line)] pt-1.5 sm:hidden'>
                <summary
                  className='ww-popover-item cursor-pointer list-none text-base [&::-webkit-details-marker]:hidden'
                  aria-label={`${t.nav.language}: ${LOCALE_NAMES[locale]}`}
                >
                  <span className='flex items-center gap-2.5'>
                    <Globe
                      className='size-[18px] text-[var(--ww-muted)]'
                      aria-hidden
                    />
                    {LOCALE_NAMES[locale]}
                  </span>
                  <ChevronDown
                    className='size-4 opacity-60 transition-transform group-open/lang:rotate-180'
                    aria-hidden
                  />
                </summary>
                <LanguageOptions
                  locale={locale}
                  hrefFor={languageHref}
                  available={available}
                  className='ww-menu-languages'
                />
              </details>
            </div>
          </details>
        </div>
      </nav>
    </header>
  )
}
