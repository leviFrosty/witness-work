import { notFound } from '@tanstack/react-router'
import {
  DEFAULT_LOCALE,
  isHelpLocale,
  type HelpLocale,
} from '@/lib/help-center/locales'
import { content, loadContent } from '@/server/content'
import { CategoryPage, HomePage, QuestionPage } from './pages'

export type HelpRoute = {
  locale: HelpLocale
  category?: string
  slug?: string
}

/**
 * Parses /help/[<locale>/][<category>/[<slug>]]. English is unprefixed; an
 * unknown category or question is a 404.
 */
export async function helpRouteLoader(splat: string): Promise<HelpRoute> {
  const center = await loadContent()
  const rest = splat.split('/').filter(Boolean)
  let locale: HelpLocale = DEFAULT_LOCALE
  if (rest[0] && rest[0] !== DEFAULT_LOCALE && isHelpLocale(rest[0])) {
    locale = rest.shift() as HelpLocale
  }
  const [category, slug, ...extra] = rest
  if (extra.length) throw notFound()
  if (!category) return { locale }
  if (!center.categories.includes(category)) throw notFound()
  if (!slug) return { locale, category }
  if (!center.questions.some((q) => q.category === category && q.slug === slug))
    throw notFound()
  return { locale, category, slug }
}

export function HelpCenterRoute({ route }: { route: HelpRoute }) {
  const center = content()
  const ctx = { center, locale: route.locale }
  if (!route.category) return <HomePage ctx={ctx} />
  if (!route.slug) return <CategoryPage ctx={ctx} category={route.category} />
  const question = center.questions.find(
    (q) => q.category === route.category && q.slug === route.slug
  )!
  return <QuestionPage ctx={ctx} question={question} />
}
