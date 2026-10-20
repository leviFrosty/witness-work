import Fuse from 'fuse.js'
import i18n, { TranslationKey } from '@/lib/locales'
import { foldArabicForSearch } from '@/lib/searchNormalize'
import { FAQEntry, faqsForPlatform } from '@/features/updates/constants/faqs'

type FAQSearchEntry = {
  entry: FAQEntry
  question: string
  answer: string
}

let cachedIndex:
  | { locale: string; platform: string; fuse: Fuse<FAQSearchEntry> }
  | undefined

// FAQ content is static. Keep the translated index across keystrokes and screen
// visits, rebuilding only when the language changes.
const getFAQIndex = (
  locale: string,
  platform: string
): Fuse<FAQSearchEntry> => {
  if (cachedIndex?.locale === locale && cachedIndex.platform === platform) {
    return cachedIndex.fuse
  }

  // Indexed folded, like the query, so Arabic matches with or without
  // harakat and across alef/ta marbuta spellings.
  const entries = faqsForPlatform(platform).map((entry) => ({
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
  cachedIndex = { locale, platform, fuse }
  return fuse
}

/** Searches the FAQs shown on `platform`; a blank query returns them all. */
export const searchFAQsFuzzy = (
  query: string,
  locale: string,
  platform: string
): FAQEntry[] => {
  const trimmed = query.trim()
  if (!trimmed) return faqsForPlatform(platform)
  return getFAQIndex(locale, platform)
    .search(foldArabicForSearch(trimmed))
    .map((result) => result.item.entry)
}
