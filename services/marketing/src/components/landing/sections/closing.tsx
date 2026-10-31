import {
  ArrowRight,
  AudioLines,
  BookUser,
  CalendarDays,
  CalendarSync,
  ChevronDown,
  Clock,
  DatabaseBackup,
  Flame,
  Heart,
  LayoutGrid,
  MapPin,
  Target,
  Users,
  Watch,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { RichText } from '@/components/help-center/rich-text'
import type { HelpEntry } from '@/lib/help-center/types'
import { HELP_LOCALES, LOCALE_NAMES } from '@/lib/help-center/locales'
import { helpPageUrl } from '@/lib/help-center/paths'
import {
  landingPath,
  messagesFor,
  type LandingLocale,
  type LandingMessages,
} from '../i18n'
import { Field, PauseToggle, Reveal, SectionHeading, StoreBadges } from '../ui'

/** Every language's headline, scrolling by; each links to that page. */
export function Languages({
  locale,
  t,
}: {
  locale: LandingLocale
  t: LandingMessages
}) {
  const rows = [HELP_LOCALES.slice(0, 10), HELP_LOCALES.slice(10)]
  return (
    <section
      className='relative overflow-hidden py-24 sm:py-32'
      aria-labelledby='ww-languages-title'
    >
      <div className='mx-auto max-w-[1200px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-languages-title'
          eyebrow={t.languages.eyebrow}
          title={t.languages.title}
          body={t.languages.body}
        />
      </div>
      <div className='ww-marquees mt-14'>
        <PauseToggle id='ww-pause-languages' label={t.nav.pause} />
        <div className='flex flex-col gap-4' dir='ltr'>
          {rows.map((row, r) => (
            <div
              key={r}
              className='ww-marquee'
              data-reverse={r === 1 ? '' : undefined}
              style={
                { '--duration': '70s', '--gap': '0.75rem' } as CSSProperties
              }
            >
              {[0, 1].map((copy) => (
                <ul
                  key={copy}
                  className='ww-marquee-track'
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {row.map((option) => {
                    const own = messagesFor(option)
                    return (
                      <li key={option}>
                        <a
                          href={landingPath(option)}
                          hrefLang={option}
                          lang={option}
                          dir={option === 'ar' ? 'rtl' : 'ltr'}
                          tabIndex={copy === 1 ? -1 : undefined}
                          aria-current={option === locale ? 'page' : undefined}
                          className='ww-lang'
                        >
                          <span className='ww-lang-name'>
                            {LOCALE_NAMES[option]}
                          </span>
                          <span className='ww-lang-title'>
                            {own.hero.title}
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** An icon and color for each of pricing.freeItems, in order. */
const FREE_ICONS = [
  [Clock, 'var(--ww-green)'],
  [Target, 'var(--ww-mint)'],
  [BookUser, 'var(--ww-gold)'],
  [MapPin, 'var(--ww-rose)'],
  [CalendarDays, 'var(--ww-teal)'],
  [Users, 'var(--ww-cyan)'],
  [AudioLines, 'var(--ww-violet)'],
  [Watch, 'var(--ww-green)'],
  [LayoutGrid, 'var(--ww-indigo)'],
  [DatabaseBackup, 'var(--ww-teal)'],
  [CalendarSync, 'var(--ww-orange)'],
  [Flame, 'var(--ww-orange)'],
] as const

/**
 * Everything that's free, laid out like a spec sheet, then Supporter as the
 * optional thank-you it is.
 */
export function Pricing({ t }: { t: LandingMessages }) {
  const p = t.pricing
  return (
    <section
      id='pricing'
      className='relative py-24 sm:py-32'
      aria-labelledby='ww-pricing-title'
    >
      <div className='mx-auto max-w-[1100px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-pricing-title'
          eyebrow={p.eyebrow}
          title={p.title}
          body={p.body}
        />
        <Reveal className='ww-card mt-14 p-3 sm:p-4'>
          <ul className='ww-free-grid'>
            {p.freeItems.map((item, i) => {
              const [Icon, color] = FREE_ICONS[i] ?? FREE_ICONS[0]
              return (
                <li
                  key={item}
                  className='ww-free-item'
                  style={{ '--c': color } as CSSProperties}
                >
                  <span className='ww-free-icon'>
                    <Icon className='size-[18px]' aria-hidden />
                  </span>
                  {item}
                </li>
              )
            })}
          </ul>
        </Reveal>
        <Reveal
          delay={120}
          className='ww-supporter mt-5 grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-14'
        >
          <div className='flex flex-col gap-3'>
            <Heart
              className='size-6 text-[var(--ww-gold)]'
              aria-hidden
              strokeWidth={2.2}
            />
            <h3 className='ww-h3 text-[clamp(1.5rem,3.6vw,2rem)]'>
              {p.supporterTitle}
            </h3>
            <p className='ww-body'>{p.supporterBody}</p>
          </div>
          <div className='flex flex-col justify-center'>
            <ul className='ww-supporter-list'>
              {p.supporterItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className='ww-foot mt-6'>{p.supporterNote}</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Faq({
  locale,
  t,
  entries,
}: {
  locale: LandingLocale
  t: LandingMessages
  entries: HelpEntry[]
}) {
  return (
    <section
      id='faq'
      className='relative py-24 sm:py-32'
      aria-labelledby='ww-faq-title'
    >
      <div className='mx-auto max-w-[860px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-faq-title'
          eyebrow={t.faq.eyebrow}
          title={t.faq.title}
        />
        <div className='ww-faq mt-12 flex flex-col'>
          {entries.map((entry, i) => (
            <Reveal key={entry.id} delay={Math.min(i, 4) * 50}>
              <details className='ww-faq-item group'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-start text-[17px] font-semibold tracking-tight [&::-webkit-details-marker]:hidden'>
                  <span>{entry.question}</span>
                  <ChevronDown
                    className='size-5 shrink-0 text-[var(--ww-muted)] transition-transform duration-300 group-open:rotate-180'
                    aria-hidden
                  />
                </summary>
                <div className='pb-6'>
                  <RichText doc={entry.doc} />
                  <a
                    href={entry.url}
                    className='mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--ww-mint)] hover:underline'
                  >
                    {t.faq.open}
                    <ArrowRight
                      className='size-3.5 rtl:-scale-x-100'
                      aria-hidden
                    />
                  </a>
                </div>
              </details>
            </Reveal>
          ))}
        </div>
        <Reveal className='mt-10 flex justify-center'>
          <a href={helpPageUrl(locale)} className='ww-btn ww-btn-ghost'>
            {t.faq.more}
            <ArrowRight className='size-4 rtl:-scale-x-100' aria-hidden />
          </a>
        </Reveal>
      </div>
    </section>
  )
}

export function Cta({
  locale,
  t,
}: {
  locale: LandingLocale
  t: LandingMessages
}) {
  return (
    <section
      id='download'
      className='relative overflow-hidden py-28 sm:py-40'
      aria-labelledby='ww-cta-title'
    >
      <div className='ww-cta-glow' aria-hidden />
      <Field />
      <div className='relative mx-auto flex max-w-[1000px] flex-col items-center px-5 text-center sm:px-8'>
        <Reveal variant='scale' className='ww-cta-icon'>
          <img
            src='/images/icon.png'
            alt=''
            width={112}
            height={112}
            loading='lazy'
            className='size-24 rounded-[26px] sm:size-28 sm:rounded-[30px]'
          />
        </Reveal>
        <Reveal
          as='h2'
          id='ww-cta-title'
          className='ww-display mt-10 text-[clamp(2.6rem,9vw,5.8rem)]'
          delay={80}
        >
          {t.cta.title}
        </Reveal>
        <Reveal as='p' className='ww-lead mt-6 max-w-xl' delay={140}>
          {t.cta.body}
        </Reveal>
        <Reveal delay={200} className='mt-10 flex items-center gap-8'>
          <StoreBadges locale={locale} labels={t.store} size='lg' />
          <figure className='ww-qr hidden lg:flex'>
            <img
              src='/images/get-qr.svg'
              alt=''
              width={96}
              height={96}
              loading='lazy'
            />
            <figcaption>{t.cta.qr}</figcaption>
          </figure>
        </Reveal>
        <Reveal as='p' className='ww-note mt-6' delay={240}>
          {t.hero.note}
        </Reveal>
      </div>
    </section>
  )
}
