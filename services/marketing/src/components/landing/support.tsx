import { ArrowRight } from 'lucide-react'
import { uiString, type UiKey } from '@/components/help-center/data'
import { HELP_LOCALES, type HelpLocale } from '@/lib/help-center/locales'
import { helpPageUrl } from '@/lib/help-center/paths'
import { BUG_REPORT, FEATURE_REQUEST, SUPPORT_EMAIL } from '@/lib/links'
import { absoluteUrl, supportPath } from '@/lib/paths'
import { content } from '@/server/content'
import { messagesFor } from './i18n'
import { PageMeta } from './page-meta'
import { WitnessWorkPage } from './page-shell'

/**
 * /support (and /<locale>/support): where to get help, the way the app's Help
 * Center ends. Its copy is the landing page's and the Help Center's, so it
 * ships in every language they do.
 */
export function SupportPage({ locale }: { locale: HelpLocale }) {
  const center = content()
  const t = messagesFor(locale)
  const ui = (key: UiKey) => uiString(center, locale, key)
  return (
    <WitnessWorkPage locale={locale} languageHref={supportPath}>
      <PageMeta
        title={`${t.footer.contact} · WitnessWork`}
        description={ui('stillNeedHelpDescription')}
        path={supportPath(locale)}
      />
      {HELP_LOCALES.map((option) => (
        <link
          key={option}
          rel='alternate'
          hrefLang={option}
          href={absoluteUrl(supportPath(option))}
        />
      ))}
      <link
        rel='alternate'
        hrefLang='x-default'
        href={absoluteUrl(supportPath('en-US'))}
      />
      <main id='main' className='ww-policy' data-support=''>
        <article className='mx-auto flex w-full max-w-[760px] flex-col gap-6 px-5 sm:px-8'>
          <header className='ww-policy-head'>
            <p className='ww-eyebrow'>WitnessWork</p>
            <h1 className='ww-display ww-policy-title'>{t.footer.contact}</h1>
            <p className='ww-lead'>{ui('intro')}</p>
          </header>
          <section className='ww-card ww-help-contact' id='help-center'>
            <h2 className='ww-h3'>{ui('helpCenter')}</h2>
            <div className='mt-2 flex flex-wrap gap-3'>
              <a href={helpPageUrl(locale)} className='ww-btn ww-btn-primary'>
                {t.faq.more}
                <ArrowRight className='size-4 rtl:-scale-x-100' aria-hidden />
              </a>
            </div>
          </section>
          <section className='ww-card ww-help-contact' id='contact'>
            <h2 className='ww-h3'>{ui('stillNeedHelp')}</h2>
            <p className='ww-body max-w-2xl'>
              {ui('stillNeedHelpDescription')}
            </p>
            <p className='ww-body'>
              {ui('emailUs')}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className='ww-link'>
                {SUPPORT_EMAIL}
              </a>
            </p>
            <div className='mt-2 flex flex-wrap gap-3'>
              <a
                href={BUG_REPORT}
                target='_blank'
                rel='noopener noreferrer'
                className='ww-btn ww-btn-ghost'
              >
                {ui('bugReport')}
              </a>
              <a
                href={FEATURE_REQUEST}
                target='_blank'
                rel='noopener noreferrer'
                className='ww-btn ww-btn-ghost'
              >
                {ui('featureRequest')}
              </a>
            </div>
          </section>
        </article>
      </main>
    </WitnessWorkPage>
  )
}
