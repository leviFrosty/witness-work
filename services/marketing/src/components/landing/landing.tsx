import { entryFor } from '@/lib/help-center/load'
import { DEFAULT_LOCALE, localeDirection } from '@/lib/help-center/locales'
import { absoluteUrl } from '@/lib/paths'
import { content } from '@/server/content'
import {
  LANDING_LOCALES,
  landingPath,
  messagesFor,
  type LandingLocale,
} from './i18n'
import { Cta, Faq, Languages, Pricing } from './sections/closing'
import { DevicesSection } from './sections/devices-section'
import { Features } from './sections/features'
import { LandingFooter } from './sections/footer'
import { Hero } from './sections/hero'
import { Journey } from './sections/journey'
import { LandingNav } from './sections/nav'
import { Privacy } from './sections/privacy'
import { Proof } from './sections/proof'
import { Statement } from './sections/statement'
import { Sync } from './sections/sync'
import { Unfold } from './sections/unfold'
import { storeLinks } from './store'

/** Help Center answers the landing page's FAQ shows, by question id. */
const FAQ_IDS = [
  'stillFree',
  'android',
  'appleWatch',
  'cloudSync',
  'dataPrivacy',
  'importOtherApps',
  'scribeWhatItDoes',
  'becomeSupporter',
]

const OG_IMAGE = absoluteUrl('/images/og.png')

/**
 * WitnessWork's landing page in one locale (/ in English, /<locale> otherwise).
 * Motion lives in public/landing.js; everything here renders at build time.
 */
export default function Landing({ locale }: { locale: LandingLocale }) {
  const t = messagesFor(locale)
  const center = content()
  // Answers not yet translated stay off a localized page; they show up on
  // the next build once the Help Center has them.
  const faq = FAQ_IDS.flatMap((id) => {
    const question = center.questions.find((q) => q.id === id)
    const entry = question && entryFor(question, locale)
    return entry && !entry.fallback ? [entry] : []
  })
  const canonical = absoluteUrl(landingPath(locale))
  const stores = storeLinks(locale)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WitnessWork',
    description: t.meta.description,
    url: canonical,
    image: OG_IMAGE,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS, iPadOS, watchOS, Android, Wear OS',
    inLanguage: locale,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    downloadUrl: [stores.appStore, stores.googlePlay],
    author: {
      '@type': 'Person',
      name: 'Levi Wilkerson',
      url: 'https://leviwilkerson.com',
    },
  }

  return (
    <div
      data-page='ww'
      lang={locale}
      dir={localeDirection(locale)}
      className='relative min-h-screen'
    >
      <title>{t.meta.title}</title>
      <meta name='description' content={t.meta.description} />
      <meta name='theme-color' content='#030604' />
      <meta property='og:type' content='website' />
      <meta property='og:title' content={t.meta.title} />
      <meta property='og:description' content={t.meta.description} />
      <meta property='og:url' content={canonical} />
      <meta property='og:image' content={OG_IMAGE} />
      <meta property='og:image:width' content='1200' />
      <meta property='og:image:height' content='630' />
      <meta property='og:locale' content={locale.replace('-', '_')} />
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:image' content={OG_IMAGE} />
      <meta name='apple-itunes-app' content='app-id=6469723047' />
      <link rel='canonical' href={canonical} />
      {LANDING_LOCALES.map((option) => (
        <link
          key={option}
          rel='alternate'
          hrefLang={option}
          href={absoluteUrl(landingPath(option))}
        />
      ))}
      <link
        rel='alternate'
        hrefLang='x-default'
        href={absoluteUrl(landingPath(DEFAULT_LOCALE))}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script async src='/landing.js' />

      <LandingNav locale={locale} t={t} />
      <main id='main'>
        <Hero locale={locale} t={t} />
        <Proof t={t} />
        <Statement locale={locale} t={t} />
        <Journey t={t} />
        <Features t={t} />
        <Unfold t={t} />
        <DevicesSection t={t} />
        <Sync t={t} />
        <Privacy t={t} />
        <Languages locale={locale} t={t} />
        <Pricing t={t} />
        <Faq locale={locale} t={t} entries={faq} />
        <Cta locale={locale} t={t} />
      </main>
      <LandingFooter locale={locale} t={t} />
    </div>
  )
}
