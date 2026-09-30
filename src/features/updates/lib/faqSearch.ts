import Fuse from 'fuse.js'
import i18n, { TranslationKey } from '@/lib/locales'
import { FAQEntry, FAQS } from '@/features/updates/constants/faqs'

type FAQSearchEntry = {
  entry: FAQEntry
  question: string
  answer: string
}

let cachedIndex: { locale: string; fuse: Fuse<FAQSearchEntry> } | undefined

// FAQ content is static. Keep the translated index across keystrokes and screen
// visits, rebuilding only when the language changes.
const getFAQIndex = (locale: string): Fuse<FAQSearchEntry> => {
  if (cachedIndex?.locale === locale) return cachedIndex.fuse

  const entries = FAQS.map((entry) => ({
    entry,
    question: i18n.t(`faq_${entry.id}_q` as TranslationKey, { locale }),
    answer: i18n.t(`faq_${entry.id}_a` as TranslationKey, { locale }),
  }))
  const fuse = new Fuse(entries, {
    keys: [
      { name: 'question', weight: 0.7 },
      { name: 'answer', weight: 0.3 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: false,
    includeScore: false,
  })
  cachedIndex = { locale, fuse }
  return fuse
}

export const searchFAQsFuzzy = (query: string, locale: string): FAQEntry[] => {
  const trimmed = query.trim()
  if (!trimmed) return FAQS
  return getFAQIndex(locale)
    .search(trimmed)
    .map((result) => result.item.entry)
}
