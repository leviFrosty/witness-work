import { GithubIcon } from '../brand-icons'
import { GITHUB } from '@/lib/links'
import { PRIVACY_PATH, supportPath, TERMS_PATH } from '@/lib/paths'
import type { HelpLocale } from '@/lib/help-center/locales'
import { helpPageUrl } from '@/lib/help-center/paths'
import type { LandingLocale, LandingMessages } from '../i18n'
import { landingPath } from '../i18n'
import { LanguagePicker } from './nav'

/**
 * One short band, like T3 Code's: the name, the few links people look for at
 * the bottom of a page, the language, and the fine print. The product links
 * live in the nav, so they aren't repeated here.
 */
export function LandingFooter({
  locale,
  t,
  languageHref = landingPath,
  available,
}: {
  locale: LandingLocale
  t: LandingMessages
  /** Where each language in the picker goes (the landing page by default). */
  languageHref?: (locale: HelpLocale) => string
  available?: (locale: HelpLocale) => boolean
}) {
  const f = t.footer
  const links = [
    { href: helpPageUrl(locale), label: t.nav.help },
    { href: supportPath(locale), label: f.contact },
    { href: PRIVACY_PATH, label: f.privacy },
    { href: TERMS_PATH, label: f.terms },
  ]
  return (
    <footer className='ww-footer relative border-t border-[var(--ww-line)]'>
      <div className='mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-7 sm:px-8'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <a
              href={landingPath(locale)}
              className='flex min-h-11 items-center gap-2.5 text-[14px] font-semibold'
            >
              <img
                src='/images/icon.png'
                alt=''
                width={24}
                height={24}
                loading='lazy'
                className='size-6 rounded-[7px]'
              />
              WitnessWork
            </a>
            <span className='text-[13px] text-[var(--ww-faint)]'>
              © {new Date().getFullYear()} Levi Wilkerson
            </span>
          </div>
          <div className='flex flex-wrap items-center justify-between gap-x-2 gap-y-1'>
            <nav aria-label='WitnessWork'>
              <ul className='-ms-2.5 flex flex-wrap items-center'>
                {links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className='ww-footer-link'>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className='flex items-center gap-1'>
              <LanguagePicker
                locale={locale}
                label={t.nav.language}
                hrefFor={languageHref}
                available={available}
                up
              />
              <a
                href={GITHUB}
                className='ww-icon-btn flex items-center justify-center'
                aria-label={f.source}
              >
                <GithubIcon className='size-[18px]' />
              </a>
            </div>
          </div>
        </div>
        <p className='max-w-[68rem] text-[11.5px] leading-relaxed text-[var(--ww-faint)]'>
          {f.independent} {f.trademarks}
        </p>
      </div>
    </footer>
  )
}
