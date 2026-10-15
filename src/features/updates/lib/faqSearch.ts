import Fuse from 'fuse.js'
import i18n, { TranslationKey } from '@/lib/locales'
import { foldArabicForSearch } from '@/lib/searchNormalize'
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

  // Indexed folded, like the query, so Arabic matches with or without
  // harakat and across alef/ta marbuta spellings.
  const entries = FAQS.map((entry) => ({
    entry,
    question: foldArabicForSearch(
      i18n.t(`faq_${entry.id}_q` as TranslationKey, { locale })
    ),
    answer: foldArabicForSearch(
      i18n.t(`faq_${entry.id}_a` as TranslationKey, { locale })
    ),
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
    .search(foldArabicForSearch(trimmed))
    .map((result) => result.item.entry)
}
