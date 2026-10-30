import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { messagesFor } from '@/components/landing/i18n'
import { WitnessWorkPage } from '@/components/landing/page-shell'
import { Field } from '@/components/landing/ui'
import { Island } from '@/islands/island'
import { BUG_REPORT, FEATURE_REQUEST, SUPPORT_EMAIL } from '@/lib/links'
import {
  categoryTitle,
  entryFor,
  type HelpCenter,
  type HelpQuestion,
} from '@/lib/help-center/load'
import {
  DEFAULT_LOCALE,
  HELP_LOCALES,
  localeDirection,
  type HelpLocale,
} from '@/lib/help-center/locales'
import { bundlePath, helpPageUrl, SITE_URL } from '@/lib/help-center/paths'
import type { HelpEntry } from '@/lib/help-center/types'
import { uiString, type UiKey } from './data'
import { RichText } from './rich-text'

type Ctx = { center: HelpCenter; locale: HelpLocale }

/** The islands bundle: built to /islands.js, served from source in dev. */
const ISLANDS_SCRIPT = import.meta.env.DEV
  ? '/src/islands/dev.ts'
  : '/islands.js'

const t = ({ center, locale }: Ctx, key: UiKey) => uiString(center, locale, key)
const absolute = (path: string) => new URL(path, SITE_URL).href

/** Marks content for one platform so the device filter can hide it. */
function platformAttr(platforms: HelpEntry['platforms']) {
  return platforms.length === 1 ? { 'data-ww-platforms': platforms[0] } : {}
}

function categoryPlatforms(center: HelpCenter, category: string) {
  const all = new Set(
    center.questions
      .filter((q) => q.category === category)
      .flatMap((q) => q.platforms)
  )
  return [...all] as HelpEntry['platforms']
}

/** "iOS only" or "Android only", for an answer about one platform. */
function platformNote(ctx: Ctx, entry: HelpEntry) {
  if (entry.platforms.length !== 1) return null
  return t(ctx, entry.platforms[0] === 'ios' ? 'iosOnly' : 'androidOnly')
}

function PlatformNote({ ctx, entry }: { ctx: Ctx; entry: HelpEntry }) {
  const note = platformNote(ctx, entry)
  return note && <span className='ww-help-only'>{note}</span>
}

function Head({
  title,
  description,
  canonical,
  alternates,
  jsonLd,
}: {
  title: string
  description: string
  canonical: string
  alternates: { locale: HelpLocale; href: string }[]
  jsonLd?: object
}) {
  const english = alternates.find((a) => a.locale === DEFAULT_LOCALE)
  return (
    <>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:url' content={canonical} />
      <link rel='canonical' href={canonical} />
      {alternates.map((alternate) => (
        <link
          key={alternate.locale}
          rel='alternate'
          hrefLang={alternate.locale}
          href={alternate.href}
        />
      ))}
      {english && (
        <link rel='alternate' hrefLang='x-default' href={english.href} />
      )}
      {jsonLd && (
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      )}
    </>
  )
}

function Breadcrumbs({
  crumbs,
}: {
  crumbs: { label: string; href?: string }[]
}) {
  return (
    <nav aria-label='Breadcrumb'>
      <ol className='ww-crumbs'>
        {crumbs.map((crumb, index) => (
          <li key={index}>
            {index > 0 && (
              <ChevronRight className='size-3.5 rtl:rotate-180' aria-hidden />
            )}
            {crumb.href ? (
              <a href={crumb.href}>{crumb.label}</a>
            ) : (
              <span aria-current='page'>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function DeviceFilter({ ctx }: { ctx: Ctx }) {
  return (
    <Island
      name='platform'
      props={{ label: t(ctx, 'device'), allLabel: t(ctx, 'all') }}
    />
  )
}

/**
 * Every Help Center page: the landing page's nav and footer around it, the way
 * back (breadcrumbs) beside the device filter, and a way to reach a person at
 * the end.
 */
function Shell({
  ctx,
  head,
  hrefFor,
  available = () => true,
  breadcrumbs,
  children,
}: {
  ctx: Ctx
  head: ReactNode
  hrefFor: (locale: HelpLocale) => string
  available?: (locale: HelpLocale) => boolean
  /** The home page has none; it puts the device filter under its search. */
  breadcrumbs?: { label: string; href?: string }[]
  children: ReactNode
}) {
  return (
    <WitnessWorkPage
      locale={ctx.locale}
      languageHref={hrefFor}
      available={available}
    >
      {/* Applies the device filter before the page paints. */}
      <script src='/help-platform.js' />
      <script type='module' src={ISLANDS_SCRIPT} />
      {head}
      <main
        id='main'
        data-help-center=''
        lang={ctx.locale}
        dir={localeDirection(ctx.locale)}
        className='ww-help'
      >
        <div className='mx-auto flex w-full max-w-[1040px] flex-col gap-16 px-5 sm:px-8 sm:gap-20'>
          {breadcrumbs && (
            <div className='ww-help-bar'>
              <Breadcrumbs crumbs={breadcrumbs} />
              <DeviceFilter ctx={ctx} />
            </div>
          )}
          {children}
          <StillNeedHelp ctx={ctx} />
        </div>
      </main>
    </WitnessWorkPage>
  )
}

function StillNeedHelp({ ctx }: { ctx: Ctx }) {
  return (
    <section id='still-need-help' className='ww-card ww-help-contact'>
      <h2 className='ww-h3'>{t(ctx, 'stillNeedHelp')}</h2>
      <p className='ww-body max-w-2xl'>{t(ctx, 'stillNeedHelpDescription')}</p>
      <p className='ww-body'>
        {t(ctx, 'emailUs')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className='ww-link'>
          {SUPPORT_EMAIL}
        </a>
      </p>
      <div className='mt-2 flex flex-wrap gap-3'>
        <a
          href={BUG_REPORT}
          target='_blank'
          rel='noopener noreferrer'
          className='ww-btn ww-btn-primary'
        >
          {t(ctx, 'bugReport')}
        </a>
        <a
          href={FEATURE_REQUEST}
          target='_blank'
          rel='noopener noreferrer'
          className='ww-btn ww-btn-ghost'
        >
          {t(ctx, 'featureRequest')}
        </a>
      </div>
    </section>
  )
}

function QuestionLink({ ctx, entry }: { ctx: Ctx; entry: HelpEntry }) {
  return (
    <li {...platformAttr(entry.platforms)}>
      <a
        href={helpPageUrl(ctx.locale, entry.category, entry.slug)}
        className='ww-q-row group'
        data-question={entry.id}
      >
        <span className='flex flex-col gap-0.5'>
          <span>{entry.question}</span>
          <PlatformNote ctx={ctx} entry={entry} />
        </span>
        <ChevronRight className='ww-q-chevron' aria-hidden />
      </a>
    </li>
  )
}

function categoryTitles(ctx: Ctx) {
  return Object.fromEntries(
    ctx.center.categories.map((id) => [
      id,
      categoryTitle(ctx.center, ctx.locale, id),
    ])
  )
}

export function HomePage({ ctx }: { ctx: Ctx }) {
  const { center, locale } = ctx
  const entries = center.questions.map((q) => entryFor(q, locale))
  const pinned = entries.filter((entry) => entry.pinned)
  const title = `WitnessWork ${t(ctx, 'helpCenter')}`
  return (
    <Shell
      ctx={ctx}
      hrefFor={(l) => helpPageUrl(l)}
      head={
        <Head
          title={title}
          description={t(ctx, 'intro')}
          canonical={absolute(helpPageUrl(locale))}
          alternates={HELP_LOCALES.map((l) => ({
            locale: l,
            href: absolute(helpPageUrl(l)),
          }))}
        />
      }
    >
      <header className='ww-help-hero'>
        <Field className='ww-help-field' />
        <p className='ww-eyebrow'>WitnessWork</p>
        <h1 className='ww-display ww-help-title'>{t(ctx, 'helpCenter')}</h1>
        <p className='ww-lead max-w-[36rem]'>{t(ctx, 'intro')}</p>
        <div className='mt-4 w-full max-w-[40rem] text-start'>
          <Island
            name='search'
            props={{
              bundlePath: bundlePath(locale),
              placeholder: t(ctx, 'searchPlaceholder'),
              noResults: t(ctx, 'noResults'),
              searching: t(ctx, 'searching'),
              clearLabel: t(ctx, 'clearSearch'),
              categoryTitles: categoryTitles(ctx),
              onlyLabels: {
                ios: t(ctx, 'iosOnly'),
                android: t(ctx, 'androidOnly'),
              },
            }}
          />
        </div>
        <DeviceFilter ctx={ctx} />
      </header>

      <section className='flex flex-col gap-6' data-section='pinned'>
        <h2 className='ww-h3'>{t(ctx, 'topQuestions')}</h2>
        <ul className='grid gap-3 sm:grid-cols-2'>
          {pinned.map((entry) => (
            <li key={entry.id} {...platformAttr(entry.platforms)}>
              <a
                href={helpPageUrl(locale, entry.category, entry.slug)}
                className='ww-topic group'
                data-question={entry.id}
              >
                <span className='ww-topic-category'>
                  {categoryTitle(center, locale, entry.category)}
                </span>
                <span className='ww-topic-question'>{entry.question}</span>
                <span className='mt-auto flex items-end justify-between gap-3 pt-2'>
                  <PlatformNote ctx={ctx} entry={entry} />
                  <ArrowRight className='ww-topic-arrow' aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className='flex flex-col gap-10' data-section='categories'>
        <h2 className='ww-h3'>{t(ctx, 'allQuestions')}</h2>
        <div className='ww-help-categories'>
          {center.categories.map((category) => {
            const inCategory = entries.filter(
              (entry) => entry.category === category
            )
            if (inCategory.length === 0) return null
            return (
              <div
                key={category}
                id={category}
                className='flex scroll-mt-24 flex-col gap-3 pb-14'
                data-category={category}
                {...platformAttr(categoryPlatforms(center, category))}
              >
                <h3>
                  <a
                    href={helpPageUrl(locale, category)}
                    className='ww-help-category'
                  >
                    {categoryTitle(center, locale, category)}
                  </a>
                </h3>
                <ul className='ww-q-list'>
                  {inCategory.map((entry) => (
                    <QuestionLink key={entry.id} ctx={ctx} entry={entry} />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>
    </Shell>
  )
}

function faqJsonLd(entries: HelpEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      url: entry.url,
      acceptedAnswer: { '@type': 'Answer', text: entry.plainText },
    })),
  }
}

export function CategoryPage({
  ctx,
  category,
}: {
  ctx: Ctx
  category: string
}) {
  const { center, locale } = ctx
  const entries = center.questions
    .filter((q) => q.category === category)
    .map((q) => entryFor(q, locale))
  const title = categoryTitle(center, locale, category)
  return (
    <Shell
      ctx={ctx}
      hrefFor={(l) => helpPageUrl(l, category)}
      breadcrumbs={[
        { label: t(ctx, 'helpCenter'), href: helpPageUrl(locale) },
        { label: title },
      ]}
      head={
        <Head
          title={`${title} · WitnessWork ${t(ctx, 'helpCenter')}`}
          description={entries
            .map((e) => e.question)
            .slice(0, 3)
            .join(' ')}
          canonical={absolute(helpPageUrl(locale, category))}
          alternates={HELP_LOCALES.map((l) => ({
            locale: l,
            href: absolute(helpPageUrl(l, category)),
          }))}
          jsonLd={faqJsonLd(entries.filter((e) => !e.fallback))}
        />
      }
    >
      <div className='flex flex-col gap-8 sm:gap-10'>
        <h1 className='ww-h2 ww-help-page-title'>{title}</h1>
        <div className='ww-faq flex flex-col'>
          {entries.map((entry) => (
            <details
              key={entry.id}
              className='ww-faq-item group'
              data-question={entry.id}
              {...platformAttr(entry.platforms)}
            >
              <summary className='flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-start text-[17px] font-semibold tracking-tight [&::-webkit-details-marker]:hidden'>
                <span className='flex flex-col gap-0.5'>
                  <span>{entry.question}</span>
                  <PlatformNote ctx={ctx} entry={entry} />
                </span>
                <ChevronDown
                  className='size-5 shrink-0 text-[var(--ww-muted)] transition-transform duration-300 group-open:rotate-180'
                  aria-hidden
                />
              </summary>
              <div className='flex flex-col items-start gap-2 pb-6'>
                <RichText doc={entry.doc} />
                <a
                  href={helpPageUrl(locale, category, entry.slug)}
                  className='mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--ww-mint)] hover:underline'
                >
                  {messagesFor(locale).faq.open}
                  <ArrowRight
                    className='size-3.5 rtl:-scale-x-100'
                    aria-hidden
                  />
                </a>
              </div>
            </details>
          ))}
        </div>
      </div>
    </Shell>
  )
}

export function QuestionPage({
  ctx,
  question,
}: {
  ctx: Ctx
  question: HelpQuestion
}) {
  const { center, locale } = ctx
  const entry = entryFor(question, locale)
  const translated = (l: HelpLocale) => !!question.translations[l]
  const hrefFor = (l: HelpLocale) =>
    helpPageUrl(l, question.category, question.slug)
  const title = categoryTitle(center, locale, question.category)
  const more = center.questions
    .filter((q) => q.category === question.category && q.id !== question.id)
    .slice(0, 6)
    .map((q) => entryFor(q, locale))
  // An untranslated page shows English, so it points search engines at the
  // English page instead of competing with it.
  const canonical = absolute(
    entry.fallback ? hrefFor(DEFAULT_LOCALE) : hrefFor(locale)
  )
  return (
    <Shell
      ctx={ctx}
      hrefFor={hrefFor}
      available={translated}
      breadcrumbs={[
        { label: t(ctx, 'helpCenter'), href: helpPageUrl(locale) },
        { label: title, href: helpPageUrl(locale, question.category) },
      ]}
      head={
        <Head
          title={`${entry.question} · WitnessWork ${t(ctx, 'helpCenter')}`}
          description={
            entry.plainText.length > 160
              ? `${entry.plainText.slice(0, 157)}…`
              : entry.plainText
          }
          canonical={canonical}
          alternates={HELP_LOCALES.filter(translated).map((l) => ({
            locale: l,
            href: absolute(hrefFor(l)),
          }))}
          jsonLd={faqJsonLd([entry])}
        />
      }
    >
      <article className='ww-help-article' data-question={entry.id}>
        <header className='flex flex-col gap-3'>
          {platformNote(ctx, entry) && (
            <p className='ww-eyebrow'>{platformNote(ctx, entry)}</p>
          )}
          <h1 className='ww-h2 ww-help-page-title'>{entry.question}</h1>
        </header>
        {entry.fallback && (
          <p className='ww-help-notice' data-fallback-notice=''>
            {t(ctx, 'notTranslated')}
          </p>
        )}
        <div
          lang={entry.fallback ? DEFAULT_LOCALE : locale}
          dir={entry.fallback ? 'ltr' : undefined}
        >
          <RichText doc={entry.doc} size='lg' />
        </div>
        <div>
          <Island
            name='copy-link'
            props={{ url: entry.url, label: t(ctx, 'copyLink') }}
          />
        </div>
      </article>

      {more.length > 0 && (
        <section className='flex flex-col gap-3'>
          <h2>
            <a
              href={helpPageUrl(locale, question.category)}
              className='ww-help-category'
            >
              {title}
            </a>
          </h2>
          <ul className='ww-q-list'>
            {more.map((other) => (
              <QuestionLink key={other.id} ctx={ctx} entry={other} />
            ))}
          </ul>
        </section>
      )}
    </Shell>
  )
}
